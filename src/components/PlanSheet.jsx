import { useState } from 'react';
import { useStore } from '../store/StoreContext';
import { apiEnabled, apiFetch, openInvoice } from '../lib/api';
import { confirmAction, haptic } from '../lib/telegram';
import Sheet from './Sheet';

const POLL_TRIES = 10;
const POLL_DELAY_MS = 1500;
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const isActive = (acc) => acc && ['paid', 'svo'].includes(acc.plan) && acc.consent;

// Экран «Сохрани голос родных навсегда»: оплата в Telegram Stars или заявка на тариф СВО.
// onActivated вызывается, когда хранение на сервере оплачено (или одобрено) и есть согласие.
export default function PlanSheet({ open, onClose, onActivated }) {
  const { t, account, refreshAccount, hasBackupPlan } = useStore();
  const [view, setView] = useState('offer'); // offer | svo | svoSent
  const [consent, setConsent] = useState(Boolean(account?.consent));
  const [busy, setBusy] = useState(''); // '' | 'pay' | 'wait' | 'svo' | 'enable'
  const [error, setError] = useState('');
  const [who, setWho] = useState('participant');
  const [name, setName] = useState('');
  const [comment, setComment] = useState('');

  const close = () => { setView('offer'); setError(''); onClose(); };

  const ensureConsent = async () => {
    if (!consent) { setError(t('planConsentNeeded')); return false; }
    if (!account?.consent) await apiFetch('/api/consent', { method: 'POST' });
    return true;
  };

  const finish = (acc) => { haptic('medium'); onActivated?.(acc); close(); };

  const handleEnable = async () => {
    setError('');
    setBusy('enable');
    try {
      if (!(await ensureConsent())) return;
      const acc = await refreshAccount();
      if (isActive(acc)) finish(acc);
    } catch (e) {
      console.error(e); setError(t('serverOffline'));
    } finally { setBusy(''); }
  };

  const handlePay = async () => {
    setError('');
    setBusy('pay');
    try {
      if (!(await ensureConsent())) return;
      const invoice = await apiFetch('/api/invoice', { method: 'POST' });
      if (invoice.test) {
        if (!(await confirmAction(t('planTestConfirm').replace('{price}', account?.priceStars ?? '')))) return;
        const acc = await apiFetch('/api/test-pay', { method: 'POST' });
        const fresh = await refreshAccount();
        if (isActive(fresh || acc)) finish(fresh || acc);
        return;
      }
      const status = await openInvoice(invoice.link);
      if (status === 'cancelled') return;
      if (status !== 'paid' && status !== 'pending') { setError(t('planPayFailed')); return; }
      // Сервер узнаёт об оплате от Telegram чуть позже, чем приложение
      setBusy('wait');
      for (let i = 0; i < POLL_TRIES; i++) {
        const acc = await refreshAccount();
        if (isActive(acc)) { finish(acc); return; }
        await wait(POLL_DELAY_MS);
      }
      setError(t('planPayFailed'));
    } catch (e) {
      console.error(e); setError(t('planPayFailed'));
    } finally { setBusy(''); }
  };

  const handleSvo = async (e) => {
    e.preventDefault();
    setError('');
    if (!name.trim()) return;
    setBusy('svo');
    try {
      if (!(await ensureConsent())) return;
      await apiFetch('/api/svo-request', { method: 'POST', json: { who, name: name.trim(), comment: comment.trim() } });
      await refreshAccount();
      haptic('medium');
      setView('svoSent');
    } catch (err) {
      console.error(err); setError(t('svoFailed'));
    } finally { setBusy(''); }
  };

  const consentBox = (
    <label className="check">
      <input type="checkbox" checked={consent} onChange={(e) => { setConsent(e.target.checked); setError(''); }} disabled={!apiEnabled} />
      <span>{t('planConsent')}</span>
    </label>
  );

  if (view === 'svoSent') {
    return (
      <Sheet open={open} onClose={close} title={t('svoTitle')}>
        <p className="plan__lead">{t('svoSent')}</p>
        <button className="btn btn--primary btn--block" onClick={close}>{t('close')}</button>
      </Sheet>
    );
  }

  if (view === 'svo') {
    return (
      <Sheet open={open} onClose={close} title={t('svoTitle')}>
        <form className="form" onSubmit={handleSvo}>
          <div className="field">
            <span>{t('svoWho')}</span>
            <div className="segmented">
              {[['participant', t('svoParticipant')], ['family', t('svoFamily')]].map(([key, label]) => (
                <button type="button" key={key} className={'segmented__item' + (who === key ? ' segmented__item--active' : '')} onClick={() => setWho(key)}>{label}</button>
              ))}
            </div>
          </div>
          <label className="field">
            <span>{t('svoName')}</span>
            <input value={name} onChange={(e) => setName(e.target.value)} maxLength={200} required />
          </label>
          <label className="field">
            <span>{t('svoComment')} · {t('optional')}</span>
            <input value={comment} onChange={(e) => setComment(e.target.value)} maxLength={1000} placeholder={t('svoCommentHint')} />
          </label>
          <p className="muted">{t('svoNote')}</p>
          {consentBox}
          {error && <p className="recorder__error">{error}</p>}
          <div className="form__actions">
            <button type="button" className="btn btn--secondary" onClick={() => { setView('offer'); setError(''); }}>{t('back')}</button>
            <button type="submit" className="btn btn--primary" disabled={!!busy || !name.trim()}>{busy === 'svo' ? t('saving') : t('svoSend')}</button>
          </div>
        </form>
      </Sheet>
    );
  }

  const price = account?.priceStars;
  const svoPending = account?.svo?.status === 'pending';

  return (
    <Sheet open={open} onClose={close} title={t('planTitle')}>
      <ul className="plan__points">
        {['planPoint1', 'planPoint2', 'planPoint3', 'planPoint4'].map((key) => <li key={key}>{t(key)}</li>)}
      </ul>

      {!apiEnabled ? (
        <p className="muted">{t('planSoon')}</p>
      ) : (
        <div className="plan__actions">
          {consentBox}
          {error && <p className="recorder__error">{error}</p>}
          {hasBackupPlan ? (
            <button className="btn btn--primary btn--block" onClick={handleEnable} disabled={!!busy}>{t('planEnable')}</button>
          ) : (
            <>
              <button className="btn btn--primary btn--block plan__pay" onClick={handlePay} disabled={!!busy || !price}>
                {busy === 'pay' ? t('planPaying') : busy === 'wait' ? t('planWaiting') : t('planPay').replace('{price}', price ?? '…')}
              </button>
              <p className="muted center">{account?.testPayments ? t('planTestNote') : t('planStarsNote')}</p>
              {svoPending
                ? <p className="muted center">{t('svoPending')}</p>
                : <button className="link-btn plan__svo" onClick={() => { setView('svo'); setError(''); }}>{t('svoLink')}</button>}
            </>
          )}
        </div>
      )}
    </Sheet>
  );
}
