import { useEffect, useState } from "react";
import {
  deleteDocument,
  getDocuments,
  getSubjects,
  uploadDocument,
} from "../services/api";
import { useToast } from "../context/ToastContext";

// Pulled from VITE_* env vars so the UI and backend stay in sync.
const MAX_UPLOAD_BYTES =
  Number(import.meta.env.VITE_MAX_UPLOAD_BYTES) || 10 * 1024 * 1024;
const ACCEPTED_EXTENSIONS = (
  import.meta.env.VITE_UPLOAD_ACCEPTED_EXTENSIONS || ".pdf,.doc,.docx,.txt"
)
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

const ACCEPTED_MIME_TYPES = {
  ".pdf": "application/pdf",
  ".doc": "application/msword",
  ".docx":
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ".txt": "text/plain",
};

function Documents() {
  const toast = useToast();
  const [documents, setDocuments] = useState([]);
  const [subjects, setSubjects] = useState([]);
  const [selectedFile, setSelectedFile] = useState(null);
  const [selectedSubjectId, setSelectedSubjectId] = useState("");

  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const [documentData, subjectData] = await Promise.all([
          getDocuments(),
          getSubjects(),
        ]);

        if (cancelled) return;

        setDocuments(documentData);

        const subjectList = Array.isArray(subjectData)
          ? subjectData
          : subjectData?.subjects || [];
        setSubjects(subjectList);

        if (subjectList.length > 0 && !selectedSubjectId) {
          setSelectedSubjectId(String(subjectList[0].id));
        }
      } catch (err) {
        if (!cancelled) toast.error(err.message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => { cancelled = true; };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  function handleFileChange(event) {
    const file = event.target.files?.[0];
    if (!file) return;

    const fileName = file.name.toLowerCase();
    const hasValidExtension = ACCEPTED_EXTENSIONS.some((ext) =>
      fileName.endsWith(ext),
    );
    const allowedTypes = Object.values(ACCEPTED_MIME_TYPES);
    const isAllowedType = allowedTypes.includes(file.type);

    if (!isAllowedType && !hasValidExtension) {
      toast.error(
        `Only ${ACCEPTED_EXTENSIONS.join(", ")} files are allowed.`,
      );
      setSelectedFile(null);
      return;
    }

    if (file.size > MAX_UPLOAD_BYTES) {
      toast.error(
        `File size must be less than ${(MAX_UPLOAD_BYTES / (1024 * 1024)).toFixed(0)} MB.`,
      );
      setSelectedFile(null);
      return;
    }

    setSelectedFile(file);
  }

  async function handleUpload() {
    if (!selectedFile) { toast.error("Please choose a file first."); return; }
    if (!selectedSubjectId) { toast.error("Please select a subject before uploading the document."); return; }

    try {
      setUploading(true);
      await uploadDocument(selectedFile, selectedSubjectId);
      setSelectedFile(null);
      const input = document.getElementById("document-file");
      if (input) input.value = "";
      const data = await getDocuments();
      setDocuments(data);
      toast.success("Document uploaded successfully.");
    } catch (err) {
      toast.error(err.message);
    } finally {
      setUploading(false);
    }
  }

  async function handleDelete(documentId) {
    if (!window.confirm("Are you sure you want to delete this document?")) return;

    try {
      await deleteDocument(documentId);
      setDocuments((currentDocuments) => currentDocuments.filter((document) => document.id !== documentId));
      toast.success("Document deleted successfully.");
    } catch (err) {
      toast.error(err.message);
    }
  }

  return (
    <div className="mx-auto max-w-6xl">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-slate-900 dark:text-slate-100">
          My Documents
        </h1>

        <p className="mt-2 text-slate-500 dark:text-slate-500">
          Upload your study materials and use them with AI Tutor.
        </p>
      </div>

      {/* Upload Card */}
      <div className="rounded-2xl border-2 border-dashed border-blue-200 dark:border-blue-700 bg-blue-50 dark:bg-blue-900/30 p-8 text-center">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-white dark:bg-slate-900 text-3xl shadow-sm">
          📄
        </div>

        <h2 className="mt-5 text-lg font-semibold text-slate-900 dark:text-slate-100">
          Upload your study material
        </h2>

        <p className="mx-auto mt-2 max-w-lg text-sm text-slate-500 dark:text-slate-500">
          Upload PDF notes, textbooks, lecture materials, or other
          academic documents.
        </p>

        <div className="mx-auto mt-6 max-w-md text-left">
          <label className="mb-2 block text-sm font-medium text-slate-700 dark:text-slate-500">
            Subject
          </label>
          <select
            value={selectedSubjectId}
            onChange={(event) => setSelectedSubjectId(event.target.value)}
            className="w-full rounded-xl border border-slate-300 bg-white dark:bg-slate-900 px-3 py-2.5 text-sm text-slate-700 dark:text-slate-500 shadow-sm focus:border-blue-500 focus:outline-none"
          >
            {subjects.length === 0 ? (
              <option value="">Create a subject first</option>
            ) : (
              subjects.map((subject) => (
                <option key={subject.id} value={subject.id}>
                  {subject.name}
                </option>
              ))
            )}
          </select>
        </div>

        <label
          htmlFor="document-file"
          className="mt-6 inline-block cursor-pointer rounded-xl bg-blue-600 px-6 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700"
        >
          📤 Choose PDF
        </label>

        <input
          id="document-file"
          type="file"
          accept={`${ACCEPTED_EXTENSIONS.join(",")},${Object.values(ACCEPTED_MIME_TYPES).join(",")}`}
          onChange={handleFileChange}
          className="hidden"
        />

        {selectedFile && (
          <div className="mx-auto mt-5 max-w-md rounded-xl border border-blue-200 bg-white dark:bg-slate-900 p-4 text-left">
            <p className="truncate text-sm font-semibold text-slate-900 dark:text-slate-100">
              {selectedFile.name}
            </p>

            <p className="mt-1 text-xs text-slate-500 dark:text-slate-500">
              {(selectedFile.size / (1024 * 1024)).toFixed(2)} MB
            </p>

            <button
              type="button"
              onClick={handleUpload}
              disabled={uploading || !selectedSubjectId}
              className="mt-4 w-full rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {uploading ? "Uploading..." : "Upload Document"}
            </button>
          </div>
        )}

        <p className="mt-4 text-xs text-slate-400 dark:text-slate-500">
          {`${ACCEPTED_EXTENSIONS.join(", ")} files only • Maximum size: ${(MAX_UPLOAD_BYTES / (1024 * 1024)).toFixed(0)} MB • Must be linked to a subject`}
        </p>
      </div>

      {/* Documents */}
      <div className="mt-8">
        <div className="mb-5">
          <h2 className="text-xl font-semibold text-slate-900 dark:text-slate-100">
            Uploaded Documents
          </h2>

          <p className="mt-1 text-sm text-slate-500 dark:text-slate-500">
            {documents.length}{" "}
            {documents.length === 1 ? "document" : "documents"} in your
            library
          </p>
        </div>

        {loading ? (
          <div className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-8 text-center">
            <p className="text-sm text-slate-500 dark:text-slate-500">
              Loading documents...
            </p>
          </div>
        ) : documents.length === 0 ? (
          <div className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-10 text-center shadow-sm">
            <div className="text-4xl">📂</div>

            <h3 className="mt-4 font-semibold text-slate-900 dark:text-slate-100">
              No documents yet
            </h3>

            <p className="mt-2 text-sm text-slate-500 dark:text-slate-500">
              Upload your first PDF to start building your study
              library.
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {documents.map((document) => (
              <div
                key={document.id}
                className="flex items-center gap-4 rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-5 shadow-sm transition hover:shadow-md"
              >
                {/* Icon */}
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-red-50 dark:bg-red-900/30 text-2xl">
                  📕
                </div>

                {/* Information */}
                <div className="min-w-0 flex-1">
                  <h3 className="truncate text-sm font-semibold text-slate-900 dark:text-slate-100">
                    {document.filename}
                  </h3>

                  <div className="mt-1 flex flex-wrap gap-2 text-xs text-slate-500 dark:text-slate-500">
                    <span>
                      {document.content_type || "PDF"}
                    </span>

                    <span>•</span>

                    <span>
                      {subjects.find((s) => s.id === document.subject_id)?.name || `Subject #${document.subject_id}`}
                    </span>
                  </div>
                </div>

                {/* Status */}
                <span className="hidden rounded-full bg-green-50 dark:bg-green-900/30 px-3 py-1.5 text-xs font-semibold text-green-600 dark:text-green-400 sm:inline-block">
                  ✓ Ready
                </span>

                {/* Delete */}
                <button
                  type="button"
                  onClick={() => handleDelete(document.id)}
                  className="rounded-lg p-2 text-slate-400 dark:text-slate-500 transition hover:bg-red-50 dark:bg-red-900/30 hover:text-red-500"
                  title="Delete document"
                >
                  🗑️
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default Documents;
