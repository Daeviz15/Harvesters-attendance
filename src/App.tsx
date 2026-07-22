import { BrowserRouter, Routes, Route } from "react-router-dom";
import RootLayout from "./routes/__root";

// Route components
import LandingPage from "./routes/index";
import Dashboard from "./routes/dashboard";
import Departments from "./routes/departments";
import Organogram from "./routes/organogram";
import Login from "./routes/auth.login";
import Signup from "./routes/auth.signup";
import WorkersIndex from "./routes/workers.index";
import WorkersNew from "./routes/workers.new";
import WorkerDetailIndex from "./routes/workers.$id.index";
import WorkerDetailEdit from "./routes/workers.$id.edit";
import WorkerProfileIndex from "./routes/worker.profile.index";
import WorkerProfileEdit from "./routes/worker.profile.edit";
import WorkerIndex from "./routes/worker.index";
import WorkerDepartment from "./routes/worker.department";
import WorkerAttendance from "./routes/worker.attendance";
import WorkerAnnouncements from "./routes/worker.announcements";

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        {/* Bare Routes */}
        <Route path="/" element={<RootLayout />}>
          <Route index element={<LandingPage />} />
          <Route path="auth/login" element={<Login />} />
          <Route path="auth/signup" element={<Signup />} />
          
          {/* Dashboard / Protected Routes */}
          <Route path="dashboard" element={<Dashboard />} />
          <Route path="departments" element={<Departments />} />
          <Route path="organogram" element={<Organogram />} />
          
          {/* Workers Management */}
          <Route path="workers">
            <Route index element={<WorkersIndex />} />
            <Route path="new" element={<WorkersNew />} />
            <Route path=":id">
              <Route index element={<WorkerDetailIndex />} />
              <Route path="edit" element={<WorkerDetailEdit />} />
            </Route>
          </Route>
          
          {/* Worker App / Individual Worker View */}
          <Route path="worker">
            <Route index element={<WorkerIndex />} />
            <Route path="profile">
              <Route index element={<WorkerProfileIndex />} />
              <Route path="edit" element={<WorkerProfileEdit />} />
            </Route>
            <Route path="department" element={<WorkerDepartment />} />
            <Route path="attendance" element={<WorkerAttendance />} />
            <Route path="announcements" element={<WorkerAnnouncements />} />
          </Route>
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
