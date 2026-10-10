import { useRef, useState } from 'react';
import { useStore } from '../store/StoreContext';
import { imageFileToDataUrl } from '../lib/image';
import Avatar from './Avatar';
import { CameraIcon } from './Icons';

export default function PhotoPicker({ name, value, onChange }) {
  const { t } = useStore();
  const inputRef = useRef(null);
  const [error, setError] = useState('');

  const handleFile = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = ''; // чтобы можно было выбрать тот же файл повторно
    if (!file) return;
    setError('');
    try {
      onChange(await imageFileToDataUrl(file));
    } catch {
      setError(t('photoError'));
    }
  };

  return (
    <div className="photo-picker">
      <button type="button" className="photo-picker__avatar" onClick={() => inputRef.current?.click()}>
        <Avatar name={name || '?'} photo={value} size={88} />
        <span className="photo-picker__badge"><CameraIcon /></span>
      </button>
      <div className="photo-picker__actions">
        <button type="button" className="link-btn" onClick={() => inputRef.current?.click()}>
          {value ? t('changePhoto') : t('addPhoto')}
        </button>
        {value && (
          <button type="button" className="link-btn link-btn--danger" onClick={() => onChange(null)}>
            {t('removePhoto')}
          </button>
        )}
      </div>
      {error && <p className="recorder__error">{error}</p>}
      <input ref={inputRef} type="file" accept="image/*" hidden onChange={handleFile} />
    </div>
  );
}
