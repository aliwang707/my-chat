'use client';
import { useState } from 'react';
import toast from 'react-hot-toast';

type Props = {
  id: string;
  title: string;
  onCancel: () => void;
  onConfirm: (id: string) => Promise<void>; // 改为返回 Promise
};

export const DeleteConfirmModal = ({ id, title, onCancel, onConfirm }: Props) => {
  const [isDeleting, setIsDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleDelete = async () => {
    setIsDeleting(true);
    setError(null);
    try {
      await onConfirm(id);
      // 删除成功，父组件会在 deleteSession 中刷新列表并关闭弹窗
      // 但为了保险，这里不自动调用 onCancel，而是由父组件在成功后主动关闭
      // 我们通过 toast 提示
      toast.success('会话已删除');
    } catch (err) {
      const msg = err instanceof Error ? err.message : '删除失败，请重试';
      setError(msg);
      toast.error(msg);
      setIsDeleting(false); // 允许重试
    }
    // 注意：如果成功，isDeleting 不会在这里设为 false，因为弹窗即将被父组件关闭
    // 但如果父组件没有在成功后关闭弹窗，这里需要处理，但通常父组件会在成功后调用 setDeleteConfirm(null)
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="delete-title"
        className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow-lg max-w-sm w-full"
      >
        <h3 id="delete-title" className="text-lg font-semibold mb-2 text-gray-900 dark:text-gray-100">
          确认删除
        </h3>
        <p className="text-gray-600 dark:text-gray-300 mb-4">
          确定要删除会话「{title || '未命名'}」吗？删除后无法恢复。
        </p>
        {error && <p className="text-red-500 text-sm mb-3">{error}</p>}
        <div className="flex justify-end gap-3">
          <button
            onClick={onCancel}
            disabled={isDeleting}
            className="px-4 py-2 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed"
          >
            取消
          </button>
          <button
            onClick={handleDelete}
            disabled={isDeleting}
            className="px-4 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600 disabled:opacity-70 disabled:cursor-not-allowed flex items-center gap-2"
          >
            {isDeleting ? (
              <>
                <span className="animate-spin">⏳</span> 删除中...
              </>
            ) : (
              '删除'
            )}
          </button>
        </div>
      </div>
    </div>
  );
};