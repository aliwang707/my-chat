type Props = {
  id: string;
  title: string;
  onCancel: () => void;
  onConfirm: (id: string) => void;
};

export const DeleteConfirmModal = ({ id, title, onCancel, onConfirm }: Props) => (
  <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
    <div role="alertdialog" aria-modal="true" aria-labelledby="delete-title" className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow-lg max-w-sm w-full">
      <h3 id="delete-title" className="text-lg font-semibold mb-2 text-gray-900 dark:text-gray-100">确认删除</h3>
      <p className="text-gray-600 dark:text-gray-300 mb-4">确定要删除会话「{title}」吗？删除后无法恢复。</p>
      <div className="flex justify-end gap-3">
        <button onClick={onCancel} className="px-4 py-2 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg">取消</button>
        <button onClick={() => onConfirm(id)} className="px-4 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600">删除</button>
      </div>
    </div>
  </div>
);