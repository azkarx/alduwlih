import React, { useRef, useState } from 'react';
import { createStoredPhotoSignedUrl } from '../services/storageService';
import type { WarehouseSettings } from '../types/warehouse';

interface StoredPhotoButtonProps {
  path: string;
  settings: WarehouseSettings;
  label?: string;
  className?: string;
}

export const StoredPhotoButton: React.FC<StoredPhotoButtonProps> = ({
  path,
  settings,
  label = 'عرض الصورة',
  className = '',
}) => {
  const requestId = useRef(0);
  const [dialog, setDialog] = useState<{
    url?: string;
    loading: boolean;
    error?: string;
  } | null>(null);

  const openPhoto = async () => {
    const currentRequestId = ++requestId.current;
    setDialog({ loading: true });
    try {
      const url = await createStoredPhotoSignedUrl(path, settings);
      if (currentRequestId === requestId.current) setDialog({ url, loading: false });
    } catch (error) {
      if (currentRequestId === requestId.current) {
        setDialog({
          loading: false,
          error: error instanceof Error ? error.message : 'تعذر فتح الصورة.',
        });
      }
    }
  };

  const closePhoto = () => {
    requestId.current += 1;
    setDialog(null);
  };

  return (
    <>
      <button
        type="button"
        onClick={() => void openPhoto()}
        aria-label={label}
        title={label}
        className={`inline-flex items-center gap-1 rounded-lg border border-[#20C5E8]/30 bg-[#20C5E8]/10 px-2 py-1 text-[11px] font-semibold text-[#8be6f5] hover:bg-[#20C5E8]/20 ${className}`}
      >
        <span className="material-symbols-outlined text-[15px]">image</span>
        {label}
      </button>
      {dialog && (
        <div
          className="fixed inset-0 z-[80] flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) closePhoto();
          }}
          role="dialog"
          aria-modal="true"
          aria-label={label}
        >
          <div className="glass-card w-full max-w-3xl rounded-2xl p-4">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="font-bold text-white">{label}</h3>
              <button
                type="button"
                onClick={closePhoto}
                aria-label="إغلاق الصورة"
                className="rounded-lg p-1 text-[#8FA6C3] hover:bg-white/10 hover:text-white"
              >
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>
            {dialog.loading && (
              <div className="flex min-h-40 items-center justify-center text-sm text-[#8FA6C3]">
                جارٍ تحميل الصورة...
              </div>
            )}
            {dialog.error && (
              <p role="alert" className="py-8 text-center text-sm text-[#ffaaaa]">
                {dialog.error}
              </p>
            )}
            {dialog.url && (
              <img
                src={dialog.url}
                alt={label}
                className="mx-auto max-h-[75vh] max-w-full rounded-xl object-contain"
              />
            )}
          </div>
        </div>
      )}
    </>
  );
};
