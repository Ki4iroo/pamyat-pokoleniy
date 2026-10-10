import { Navigate, Route, Routes } from 'react-router-dom';
import TabBar from './components/TabBar';
import FamilyScreen from './screens/FamilyScreen';
import RelativeProfile from './screens/RelativeProfile';
import TreeScreen from './screens/TreeScreen';
import StoriesScreen from './screens/StoriesScreen';
import SettingsScreen from './screens/SettingsScreen';

export default function App() {
  return (
    <div className="app">
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
