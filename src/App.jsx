import { Navigate, Route, Routes } from 'react-router-dom';
import TabBar from './components/TabBar';
import FamilyScreen from './screens/FamilyScreen';
import RelativeProfile from './screens/RelativeProfile';
import TreeScreen from './screens/TreeScreen';
import StoriesScreen from './screens/StoriesScreen';
import SettingsScreen from './screens/SettingsScreen';
import Onboarding from './screens/Onboarding';
import { useStore } from './store/StoreContext';

export default function App() {
  const { onboarded, status, saveError, dismissSaveError, t } = useStore();
  if (!onboarded) return <Onboarding />;
  if (status === 'loading') return <div className="app-status" aria-busy="true" />;
  if (status === 'unavailable') return <div className="app-status"><p>{t('storageUnavailable')}</p></div>;

  return (
    <div className="app">
      {saveError && (
        <button className="save-error" onClick={dismissSaveError}>{t('saveFailed')}</button>
      )}
      <main className="screen">
        <Routes>
          <Route path="/" element={<FamilyScreen />} />
          <Route path="/relative/:id" element={<RelativeProfile />} />
          <Route path="/tree" element={<TreeScreen />} />
          <Route path="/stories" element={<StoriesScreen />} />
          <Route path="/settings" element={<SettingsScreen />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
      <TabBar />
    </div>
  );
}
