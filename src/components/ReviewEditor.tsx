import { useEffect, useRef, useState } from "react";
import { EditorView, basicSetup } from "codemirror";
import { markdown } from "@codemirror/lang-markdown";
import { EditorState } from "@codemirror/state";
import type { Review } from "../types/book";
import { useBookStore } from "../stores/bookStore";
import { useToastStore } from "../stores/toastStore";
import { open } from "@tauri-apps/plugin-dialog";
import { renderMarkdown } from "../utils/markdown";

interface Props {
  bookId: number;
}

export function ReviewEditor({ bookId }: Props) {
  const { reviews, fetchReviews, createReview, updateReview, deleteReview, importReviewMd } =
    useBookStore();
  const { addToast } = useToastStore();
  const [editingId, setEditingId] = useState<number | null>(null);
  const [newContent, setNewContent] = useState("");
  const [showNew, setShowNew] = useState(false);
  const [newPreview, setNewPreview] = useState(false);
  const editorRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);

  useEffect(() => {
    fetchReviews(bookId);
  }, [bookId]);

  useEffect(() => {
    if (showNew && editorRef.current && !viewRef.current) {
      const view = new EditorView({
        state: EditorState.create({
          doc: newContent,
          extensions: [
            basicSetup,
            markdown(),
            EditorView.updateListener.of((u) => {
              if (u.docChanged) setNewContent(u.state.doc.toString());
            }),
          ],
        }),
        parent: editorRef.current,
      });
      viewRef.current = view;
    }
    if (!showNew && viewRef.current) {
      viewRef.current.destroy();
      viewRef.current = null;
      setNewPreview(false);
    }
  }, [showNew]);

  // 组件卸载时销毁编辑器，防止内存泄漏
  useEffect(() => {
    return () => {
      if (viewRef.current) {
        viewRef.current.destroy();
        viewRef.current = null;
      }
    };
  }, []);

  const handleCreate = async () => {
    if (!newContent.trim()) return;
    try {
      await createReview({ book_id: bookId, content: newContent });
      setNewContent("");
      setShowNew(false);
      if (viewRef.current) {
        viewRef.current.dispatch({ changes: { from: 0, to: viewRef.current.state.doc.length, insert: "" } });
      }
    } catch (err) {
      addToast(String(err));
    }
  };

  const handleImport = async () => {
    try {
      const path = await open({ filters: [{ name: "Markdown", extensions: ["md"] }] });
      if (path && typeof path === "string") {
        await importReviewMd(bookId, path);
      }
    } catch (err) {
      addToast(String(err));
    }
  };

  return (
    <div>
      <div className="sticky top-0 z-10 bg-white flex items-center justify-between px-5 py-3 border-b border-gray-100">
        <h3 className="font-semibold text-gray-800">书评 ({reviews.length})</h3>
        <div className="flex gap-1">
          <button
            onClick={handleImport}
            title="导入书评"
            className="p-1.5 rounded text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors cursor-pointer"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
            </svg>
          </button>
          <button
            onClick={() => setShowNew(true)}
            title="写书评"
            className="p-1.5 rounded text-gray-400 hover:text-blue-500 hover:bg-blue-50 transition-colors cursor-pointer"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
            </svg>
          </button>
        </div>
      </div>

      <div className="flex flex-col gap-4 px-5 py-4">
      {showNew && (
        <div className="border border-gray-200 rounded-xl overflow-hidden">
          <EditPreviewTabs preview={newPreview} onToggle={setNewPreview} />
          <div
            ref={editorRef}
            className="min-h-[200px] text-sm"
            style={{ display: newPreview ? "none" : "block" }}
          />
          {newPreview && (
            <div
              className="min-h-[200px] px-4 py-3 md-body"
              dangerouslySetInnerHTML={{ __html: renderMarkdown(newContent) || "<p class='text-gray-400'>暂无内容</p>" }}
            />
          )}
          <div className="flex justify-end gap-2 p-2 bg-gray-50 border-t">
            <button
              onClick={() => { setShowNew(false); setNewContent(""); }}
              className="text-xs text-gray-500 px-3 py-1 cursor-pointer"
            >
              取消
            </button>
            <button
              onClick={handleCreate}
              className="text-xs bg-blue-500 text-white px-4 py-1 rounded-lg hover:bg-blue-600 cursor-pointer"
            >
              保存
            </button>
          </div>
        </div>
      )}

      {reviews.map((review) => (
        <ReviewItem
          key={review.id}
          review={review}
          editingId={editingId}
          onEdit={setEditingId}
          onUpdate={updateReview}
          onDelete={deleteReview}
          onError={addToast}
        />
      ))}
      </div>
    </div>
  );

}

function EditPreviewTabs({ preview, onToggle }: { preview: boolean; onToggle: (v: boolean) => void }) {
  return (
    <div className="flex border-b border-gray-200 bg-gray-50 text-xs">
      <button
        onClick={() => onToggle(false)}
        className={`px-4 py-2 cursor-pointer transition-colors ${!preview ? "text-blue-600 border-b-2 border-blue-500 bg-white -mb-px" : "text-gray-500 hover:text-gray-700"}`}
      >
        编辑
      </button>
      <button
        onClick={() => onToggle(true)}
        className={`px-4 py-2 cursor-pointer transition-colors ${preview ? "text-blue-600 border-b-2 border-blue-500 bg-white -mb-px" : "text-gray-500 hover:text-gray-700"}`}
      >
        预览
      </button>
    </div>
  );
}

function ReviewItem({
  review,
  editingId,
  onEdit,
  onUpdate,
  onDelete,
  onError,
}: {
  review: Review;
  editingId: number | null;
  onEdit: (id: number | null) => void;
  onUpdate: (id: number, content: string) => Promise<Review>;
  onDelete: (id: number) => Promise<void>;
  onError: (msg: string) => void;
}) {
  const [content, setContent] = useState(review.content);
  const [editPreview, setEditPreview] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const deleteTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const editorRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const isEditing = editingId === review.id;

  const handleDeleteClick = () => {
    if (confirmingDelete) {
      if (deleteTimerRef.current) clearTimeout(deleteTimerRef.current);
      setConfirmingDelete(false);
      handleDelete();
    } else {
      setConfirmingDelete(true);
      deleteTimerRef.current = setTimeout(() => setConfirmingDelete(false), 2000);
    }
  };

  useEffect(() => {
    if (isEditing && editorRef.current && !viewRef.current) {
      const view = new EditorView({
        state: EditorState.create({
          doc: content,
          extensions: [
            basicSetup,
            markdown(),
            EditorView.updateListener.of((u) => {
              if (u.docChanged) setContent(u.state.doc.toString());
            }),
          ],
        }),
        parent: editorRef.current,
      });
      viewRef.current = view;
    }
    if (!isEditing && viewRef.current) {
      viewRef.current.destroy();
      viewRef.current = null;
      setEditPreview(false);
    }
  }, [isEditing]);

  const save = async () => {
    try {
      await onUpdate(review.id, content);
      onEdit(null);
    } catch (err) {
      onError(String(err));
    }
  };

  const handleDelete = async () => {
    try {
      await onDelete(review.id);
    } catch (err) {
      onError(String(err));
    }
  };

  return (
    <div className="border border-gray-200 rounded-xl overflow-hidden">
      <div className="flex items-center justify-between px-4 pt-3 pb-2">
        <span className="text-xs text-gray-400">{review.reviewed_at}</span>
        <div className="flex gap-1">
          {!isEditing && (
            <button
              onClick={() => onEdit(review.id)}
              title="编辑"
              className="p-1 rounded text-gray-400 hover:text-blue-500 hover:bg-blue-50 transition-colors cursor-pointer"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536M9 13l6.586-6.586a2 2 0 012.828 2.828L11.828 15.828a2 2 0 01-1.414.586H8v-2.414a2 2 0 01.586-1.414z" />
              </svg>
            </button>
          )}
          <button
            onClick={handleDeleteClick}
            title={confirmingDelete ? "再次点击确认删除" : "删除"}
            className={`p-1 rounded transition-colors cursor-pointer ${confirmingDelete ? "text-red-500 bg-red-50" : "text-gray-400 hover:text-red-500 hover:bg-red-50"}`}
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6M9 7V4h6v3M4 7h16" />
            </svg>
          </button>
        </div>
      </div>

      {isEditing ? (
        <>
          <EditPreviewTabs preview={editPreview} onToggle={setEditPreview} />
          <div
            ref={editorRef}
            className="min-h-[150px] text-sm"
            style={{ display: editPreview ? "none" : "block" }}
          />
          {editPreview && (
            <div
              className="min-h-[150px] px-4 py-3 md-body"
              dangerouslySetInnerHTML={{ __html: renderMarkdown(content) || "<p class='text-gray-400'>暂无内容</p>" }}
            />
          )}
          <div className="flex justify-end gap-2 p-2 bg-gray-50 border-t">
            <button onClick={() => onEdit(null)} className="text-xs text-gray-500 px-3 py-1 cursor-pointer">取消</button>
            <button onClick={save} className="text-xs bg-blue-500 text-white px-4 py-1 rounded-lg hover:bg-blue-600 cursor-pointer">保存</button>
          </div>
        </>
      ) : (
        <div
          className="px-4 pb-4 md-body"
          dangerouslySetInnerHTML={{ __html: renderMarkdown(review.content) }}
        />
      )}
    </div>
  );
}
