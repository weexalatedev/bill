import { Navigate, Route, Routes } from 'react-router-dom';
import Layout from './components/Layout';
import Dashboard from './pages/Dashboard';
import Bills from './pages/Bills';
import Optimiser from './pages/Optimiser';
import Sites from './pages/Sites';
import Copilot from './pages/Copilot';
import Plans from './pages/Plans';

export default function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<Dashboard />} />
        <Route path="bills" element={<Bills />} />
        <Route path="optimiser" element={<Optimiser />} />
        <Route path="sites" element={<Sites />} />
        <Route path="copilot" element={<Copilot />} />
        <Route path="plans" element={<Plans />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}