import { useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useStore } from '../store/StoreContext';
import { getTelegramUser, haptic } from '../lib/telegram';
import { MicIcon, TreeIcon, UsersIcon } from '../components/Icons';

const slides = [
  { Icon: UsersIcon, title: 'onb1Title', text: 'onb1Text' },
  { Icon: TreeIcon, title: 'onb2Title', text: 'onb2Text' },
  { Icon: MicIcon, title: 'onb3Title', text: 'onb3Text' },
];

const SWIPE_THRESHOLD = 50;

export default function Onboarding() {
  const { t, setOnboarded } = useStore();
  const navigate = useNavigate();
  const [step, setStep] = useState(0);
  const touchX = useRef(null);

  const firstName = getTelegramUser()?.first_name;
  const isLast = step === slides.length - 1;
  const { Icon, title, text } = slides[step];

  const go = (next) => {
    if (next < 0 || next >= slides.length) return;
    haptic('light');
    setStep(next);
  };

  const finish = (addFirst) => {
    haptic('medium');
    setOnboarded(true);
    navigate(addFirst ? '/?add=1' : '/', { replace: true });
  };

  const onTouchStart = (e) => { touchX.current = e.touches[0].clientX; };
  const onTouchEnd = (e) => {
    if (touchX.current === null) return;
    const dx = e.changedTouches[0].clientX - touchX.current;
    touchX.current = null;
    if (dx < -SWIPE_THRESHOLD) go(step + 1);
    else if (dx > SWIPE_THRESHOLD) go(step - 1);
  };

  return (
    <div className="onb" onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
      <div className="onb__top">
        {!isLast && <button className="link-btn onb__skip" onClick={() => finish(false)}>{t('onbSkip')}</button>}
      </div>

      <div className="onb__slide" key={step}>
        <div className="onb__art"><Icon /></div>
        <h1 className="onb__title">{t(title).replace('{name}', firstName ? `, ${firstName}` : '')}</h1>
        <p className="onb__text">{t(text)}</p>
      </div>

      <div className="onb__bottom">
        <div className="onb__dots">
          {slides.map((_, i) => (
            <button
              key={i}
              className={'onb__dot' + (i === step ? ' onb__dot--active' : '')}
              onClick={() => go(i)}
              aria-label={String(i + 1)}
            />
          ))}
        </div>

        {isLast ? (
          <>
            <button className="btn btn--primary btn--block" onClick={() => finish(true)}>{t('onbStart')}</button>
            <button className="btn btn--ghost btn--block" onClick={() => finish(false)}>{t('onbLater')}</button>
          </>
        ) : (
          <button className="btn btn--primary btn--block" onClick={() => go(step + 1)}>{t('onbNext')}</button>
        )}
        <p className="muted center">{t('onbPrivacy')}</p>
      </div>
    </div>
  );
}
