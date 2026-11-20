import React, { useEffect, useRef, useState } from 'react';
import { getMovementPhotoError } from '../utils/movementPhoto';

interface MovementPhotoFieldProps {
  file: File | null;
  onChange: (file: File | null) => void;
}

export const MovementPhotoField: React.FC<MovementPhotoFieldProps> = ({ file, onChange }) => {
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const libraryInputRef = useRef<HTMLInputElement>(null);
  const [previewUrl, setPreviewUrl] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    if (!file) {
      setPreviewUrl('');
      return;
    }

    const url = URL.createObjectURL(file);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const selected = event.target.files?.[0] || null;
    event.target.value = '';
    setError('');
    if (!selected) return;

    const validationError = getMovementPhotoError(selected);
    if (validationError) {
      setError(validationError);
      return;
    }

    onChange(selected);
  };

  return (
    <div className="sm:col-span-2">
      <span className="mb-1.5 block text-[12px] font-semibold text-[#c1c6d7]">
        صورة العملية <span className="font-normal text-[#8FA6C3]">(اختياري، حتى 8 ميجابايت)</span>
      </span>
      <input
        ref={cameraInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        capture="environment"
        onChange={handleFileChange}
        className="hidden"
      />
      <input
        ref={libraryInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        onChange={handleFileChange}
        className="hidden"
      />

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => cameraInputRef.current?.click()}
          className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-[#20C5E8]/35 bg-[#20C5E8]/10 px-3 text-xs font-semibold text-[#8be6f5] hover:bg-[#20C5E8]/20"
        >
          <span className="material-symbols-outlined text-[17px]">photo_camera</span>
          تصوير
        </button>
        <button
          type="button"
          onClick={() => libraryInputRef.current?.click()}
          className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-white/15 bg-white/5 px-3 text-xs font-semibold text-[#d7e3fc] hover:bg-white/10"
        >
          <span className="material-symbols-outlined text-[17px]">photo_library</span>
          اختيار صورة
        </button>
        {file && (
          <button
            type="button"
            onClick={() => {
              onChange(null);
              setError('');
            }}
            className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-[#EF4444]/35 bg-[#EF4444]/10 px-3 text-xs font-semibold text-[#ffaaaa] hover:bg-[#EF4444]/20"
          >
            <span className="material-symbols-outlined text-[17px]">close</span>
            إزالة الصورة
          </button>
        )}
      </div>

      {previewUrl && (
        <div className="mt-3 flex items-center gap-3 rounded-xl border border-white/10 bg-[#071426]/55 p-2.5">
          <img
            src={previewUrl}
            alt="معاينة صورة العملية"
            className="h-16 w-16 rounded-lg object-cover"
          />
          <span className="min-w-0 truncate text-xs text-[#8FA6C3]">{file?.name}</span>
        </div>
      )}

      {error && (
        <p role="alert" className="mt-2 text-xs text-[#ffaaaa]">
          {error}
        </p>
      )}
    </div>
  );
};
