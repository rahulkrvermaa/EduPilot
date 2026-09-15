import { useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

import {
  askAITutor,
  getAIChatHistory,
  clearAIChatHistory,
  getSubjects,
} from "../services/api";
import { useToast } from "../context/ToastContext";


function AITutor() {
  const toast = useToast();
  const [message, setMessage] = useState("");
  const [messages, setMessages] = useState([]);
  const [subjects, setSubjects] = useState([]);
  const [subjectId, setSubjectId] = useState("");

  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);

  const messagesEndRef = useRef(null);
  const messageCounterRef = useRef(0);

  const createMessageId = (prefix) => {
    messageCounterRef.current += 1;
    return `${prefix}-${messageCounterRef.current}`;
  };

  const suggestedQuestions = [
    "Explain normalization in DBMS",
    "What is a deadlock?",
    "Explain TCP vs UDP",
    "Give me a DSA practice question",
  ];

  // =========================================================
  // LOAD CHAT HISTORY
  // =========================================================

  useEffect(() => {
    let cancelled = false;

    async function loadChat() {
      try {
        setLoading(true);

        const [history, subjectData] = await Promise.all([
          getAIChatHistory(),
          getSubjects(),
        ]);

        if (!cancelled) {
          setMessages(
            Array.isArray(history)
              ? history.map((item) => ({
                  id: item.id,
                  role:
                    item.role === "ai"
                      ? "assistant"
                      : "user",
                  content: item.content,
                }))
              : [],
          );

          const list = Array.isArray(subjectData)
            ? subjectData
            : subjectData?.subjects || [];
          setSubjects(list);
        }
      } catch (err) {
        if (!cancelled) {
          toast.error(err.message || "Unable to load chat history.");
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void loadChat();

    return () => {
      cancelled = true;
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps


  // =========================================================
  // AUTO SCROLL
  // =========================================================

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({
      behavior: "smooth",
    });
  }, [messages, sending]);


  // =========================================================
  // SEND MESSAGE
  // =========================================================

  async function handleSend(
    questionOverride = null
  ) {
    const question = (
      questionOverride ?? message
    ).trim();

    if (!question || sending) {
      return;
    }

    setMessage("");

    const temporaryUserMessage = {
      id: createMessageId("user"),
      role: "user",
      content: question,
    };

    setMessages((previous) => [
      ...previous,
      temporaryUserMessage,
    ]);

    setSending(true);

    try {
      const data = await askAITutor(
        question,
        subjectId || null
      );

      if (!data?.answer) {
        throw new Error(
          "AI did not return an answer."
        );
      }

      const aiMessage = {
        id: createMessageId("ai"),
        role: "assistant",
        content: data.answer,
        sources: data.sources || [],
      };

      setMessages((previous) => [
        ...previous,
        aiMessage,
      ]);
    } catch (err) {
      console.error(
        "EduPilot chat error:",
        err
      );

      toast.error(
        err.message ||
          "Unable to connect to EduPilot AI."
      );
    } finally {
      setSending(false);
    }
  }


  // =========================================================
  // SUGGESTED QUESTION
  // =========================================================

  function handleSuggestedQuestion(question) {
    handleSend(question);
  }


  // =========================================================
  // NEW CHAT
  // =========================================================

  async function handleNewChat() {
    if (sending) {
      return;
    }

    try {
      await clearAIChatHistory();

      setMessages([]);
    } catch (err) {
      toast.error(
        err.message ||
          "Unable to clear chat history."
      );
    }
  }


  // =========================================================
  // RENDER
  // =========================================================

  return (
    <div className="flex h-[calc(100vh-5rem)] min-h-0 flex-col">

      {/* =================================================
          HEADER
      ================================================= */}

      <header className="shrink-0 border-b border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-6 py-4 sm:px-8">
        <div className="mx-auto flex max-w-5xl items-center justify-between">

          <div className="flex items-center gap-3">

            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-blue-100 text-2xl">
              🤖
            </div>

            <div>
              <h1 className="font-semibold text-slate-900 dark:text-slate-100">
                AI Tutor
              </h1>

              <p className="flex items-center gap-1 text-xs text-green-600 dark:text-green-400">
                <span className="text-[10px]">
                  ●
                </span>
                Ready to help
              </p>
            </div>

          </div>


          <div className="flex items-center gap-2">

            <select
              value={subjectId}
              onChange={(event) =>
                setSubjectId(
                  event.target.value
                )
              }
              className="hidden rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-xs text-slate-600 dark:text-slate-300 outline-none focus:border-blue-400 sm:block"
            >
              <option value="">
                All subjects
              </option>

              {subjects.map((subject) => (
                <option
                  key={subject.id}
                  value={subject.id}
                >
                  {subject.name}
                </option>
              ))}
            </select>


            {messages.length > 0 && (
              <button
                type="button"
                onClick={handleNewChat}
                disabled={sending}
                className="rounded-lg px-3 py-2 text-xs font-medium text-slate-500 dark:text-slate-500 transition hover:bg-slate-100 dark:bg-slate-800 hover:text-slate-700 dark:text-slate-300 disabled:cursor-not-allowed disabled:opacity-50"
              >
                New Chat
              </button>
            )}

          </div>

        </div>
      </header>


      {/* =================================================
          CHAT AREA
      ================================================= */}

      <section className="min-h-0 flex-1 overflow-y-auto">

        <div className="mx-auto max-w-4xl px-6 py-8 sm:px-8">

          {/* Loading history */}

          {loading && (
            <div className="flex min-h-[300px] items-center justify-center">
              <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-6 py-4 text-sm text-slate-500 dark:text-slate-500 shadow-sm">
                Loading chat...
              </div>
            </div>
          )}


          {/* Empty state */}

          {!loading &&
            messages.length === 0 && (
              <>
                <div className="flex gap-4">

                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-blue-600 text-lg shadow-sm">
                    🤖
                  </div>

                  <div className="max-w-2xl rounded-2xl rounded-tl-none bg-white dark:bg-slate-900 p-5 shadow-sm ring-1 ring-slate-100">

                    <p className="text-sm font-medium text-slate-900 dark:text-slate-100">
                      Hello! 👋 I'm your EduPilot AI Tutor.
                    </p>

                    <p className="mt-2 text-sm leading-6 text-slate-600 dark:text-slate-300">
                      Ask me about your subjects,
                      uploaded documents,
                      programming problems,
                      or anything you're studying.
                    </p>

                  </div>

                </div>


                <div className="mt-8">

                  <p className="mb-4 text-sm font-semibold text-slate-700 dark:text-slate-300">
                    Try asking:
                  </p>

                  <div className="grid gap-3 sm:grid-cols-2">

                    {suggestedQuestions.map(
                      (question) => (
                        <button
                          key={question}
                          type="button"
                          onClick={() =>
                            handleSuggestedQuestion(
                              question
                            )
                          }
                          disabled={sending}
                          className="group rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-4 text-left text-sm text-slate-600 dark:text-slate-300 shadow-sm transition hover:-translate-y-0.5 hover:border-blue-300 hover:bg-blue-50 dark:hover:bg-blue-900/30 hover:text-blue-600 dark:text-blue-400 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          <div className="flex items-center justify-between gap-3">

                            <span>
                              {question}
                            </span>

                            <span className="text-slate-300 transition group-hover:text-blue-500 dark:text-blue-400">
                              →
                            </span>

                          </div>
                        </button>
                      )
                    )}

                  </div>

                </div>
              </>
            )}


          {/* =================================================
              MESSAGES
          ================================================= */}

          {!loading &&
            messages.map((item) => (
              <div
                key={item.id}
                className={`mt-7 flex gap-3 sm:gap-4 ${
                  item.role === "user"
                    ? "justify-end"
                    : "justify-start"
                }`}
              >

                {item.role ===
                  "assistant" && (
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-blue-600 text-lg shadow-sm">
                    🤖
                  </div>
                )}


                <div
                  className={`max-w-[85%] rounded-2xl px-5 py-4 text-sm leading-7 sm:max-w-2xl ${
                    item.role === "user"
                      ? "rounded-tr-none bg-blue-600 text-white shadow-sm"
                      : "rounded-tl-none bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 shadow-sm ring-1 ring-slate-100"
                  }`}
                >

                  {item.role ===
                  "assistant" ? (
                    <div className="prose prose-sm prose-slate max-w-none prose-headings:font-semibold prose-headings:text-slate-900 dark:text-slate-100 prose-p:my-2 prose-p:leading-7 prose-ul:my-3 prose-ol:my-3 prose-li:my-1 prose-strong:text-slate-900 dark:text-slate-100 prose-code:rounded prose-code:bg-slate-100 dark:bg-slate-800 prose-code:px-1.5 prose-code:py-0.5 prose-code:text-blue-700 prose-code:before:content-none prose-code:after:content-none prose-pre:overflow-x-auto prose-pre:rounded-xl prose-pre:bg-slate-900 prose-pre:p-4 prose-pre:text-slate-100">
                      <ReactMarkdown
                        remarkPlugins={[
                          remarkGfm,
                        ]}
                      >
                        {item.content}
                      </ReactMarkdown>
                    </div>
                  ) : (
                    <p className="whitespace-pre-wrap break-words">
                      {item.content}
                    </p>
                  )}

                </div>


                {item.role === "user" && (
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-slate-200 text-lg">
                    👤
                  </div>
                )}

              </div>
            ))}


          {/* =================================================
              SOURCES
          ================================================= */}

          {!loading &&
            messages.map(
              (item) =>
                item.role ===
                  "assistant" &&
                item.sources?.length > 0 && (
                  <div
                    key={`sources-${item.id}`}
                    className="ml-14 mt-2 max-w-2xl"
                  >
                    <p className="mb-2 text-xs font-semibold text-slate-400 dark:text-slate-500">
                      Related documents
                    </p>

                    <div className="space-y-1">
                      {item.sources.map(
                        (source, index) => (
                          <div
                            key={`${source.document_id}-${source.chunk_index}-${index}`}
                            className="rounded-lg bg-slate-100 dark:bg-slate-800 px-3 py-2 text-xs text-slate-500 dark:text-slate-500"
                          >
                            <span className="font-medium text-slate-700 dark:text-slate-300">
                              {source.filename}
                            </span>

                            <span className="ml-2">
                              Chunk{" "}
                              {source.chunk_index}
                            </span>
                          </div>
                        )
                      )}
                    </div>
                  </div>
                )
            )}


          {/* =================================================
              THINKING
          ================================================= */}

          {sending && (
            <div className="mt-7 flex gap-4">

              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-blue-600 text-lg shadow-sm">
                🤖
              </div>

              <div className="rounded-2xl rounded-tl-none bg-white dark:bg-slate-900 px-5 py-4 shadow-sm ring-1 ring-slate-100">

                <div className="flex items-center gap-2">

                  <span className="text-sm text-slate-500 dark:text-slate-500">
                    Thinking
                  </span>

                  <span className="flex gap-1">

                    <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-slate-400 [animation-delay:-0.3s]" />

                    <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-slate-400 [animation-delay:-0.15s]" />

                    <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-slate-400" />

                  </span>

                </div>

              </div>

            </div>
          )}


          <div ref={messagesEndRef} />

        </div>

      </section>


      {/* =================================================
          INPUT
      ================================================= */}

      <footer className="shrink-0 border-t border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-4 py-4 sm:px-8 sm:py-5">

        <div className="mx-auto max-w-4xl">

          <div className="flex items-end gap-2 rounded-2xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 p-2 transition focus-within:border-blue-400 focus-within:bg-white dark:bg-slate-900 focus-within:ring-4 focus-within:ring-blue-50">

            <textarea
              value={message}
              onChange={(event) =>
                setMessage(
                  event.target.value
                )
              }
              onKeyDown={(event) => {
                if (
                  event.key ===
                    "Enter" &&
                  !event.shiftKey
                ) {
                  event.preventDefault();
                  handleSend();
                }
              }}
              placeholder="Ask EduPilot anything..."
              rows={1}
              disabled={sending}
              className="max-h-32 min-h-11 flex-1 resize-none overflow-y-auto bg-transparent px-3 py-3 text-sm leading-5 text-slate-900 dark:text-slate-100 outline-none placeholder:text-slate-400 dark:text-slate-500 disabled:cursor-not-allowed disabled:opacity-50"
            />

            <button
              type="button"
              onClick={() =>
                handleSend()
              }
              disabled={
                !message.trim() ||
                sending
              }
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-blue-600 text-lg text-white shadow-sm transition hover:bg-blue-700 dark:hover:bg-blue-500 active:scale-95 disabled:cursor-not-allowed disabled:opacity-40"
              aria-label="Send message"
            >
              {sending
                ? "⏳"
                : "➤"}
            </button>

          </div>

          <p className="mt-2 text-center text-xs text-slate-400 dark:text-slate-500">
            Enter to send · Shift + Enter for a new line
          </p>

        </div>

      </footer>

    </div>
  );
}


export default AITutor;
