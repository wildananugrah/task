import { AppProvider } from './state/AppProvider'
import { useApp } from './state/useApp'
import ChatDock from './components/ChatDock'
import ConfirmDialog from './components/ConfirmDialog'
import ErrorBanner from './components/ErrorBanner'
import FilePreviewDialog from './components/FilePreviewDialog'
import FilesScreen from './components/FilesScreen'
import GlobalSearch from './components/GlobalSearch'
import InviteDialog from './components/InviteDialog'
import LoginScreen from './components/LoginScreen'
import NewWorkspaceDialog from './components/NewWorkspaceDialog'
import Sidebar from './components/Sidebar'
import SettingsScreen from './components/SettingsScreen'
import TaskDrawer from './components/TaskDrawer'
import TasksScreen from './components/TasksScreen'
import WorkspacesScreen from './components/WorkspacesScreen'

function Workspace() {
  const { state } = useApp()

  const globalOpen = state.gFocus && state.gq.trim().length > 0
  const inWorkspace = state.workspace !== null

  return (
    <div className="flex h-screen min-h-[640px] overflow-hidden bg-canvas">
      <Sidebar />

      <main className="relative flex min-w-0 flex-1 flex-col overflow-hidden">
        {state.screen === 'workspaces' && <WorkspacesScreen />}
        {state.screen === 'tasks' && inWorkspace && <TasksScreen />}
        {state.screen === 'files' && inWorkspace && <FilesScreen />}
        {state.screen === 'settings' && inWorkspace && <SettingsScreen />}

        <TaskDrawer />
      </main>

      {state.preview && <FilePreviewDialog />}
      {state.confirm && <ConfirmDialog />}
      {state.inviteOpen && <InviteDialog />}
      {state.newWsOpen && <NewWorkspaceDialog />}
      {globalOpen && <GlobalSearch />}

      <ChatDock />
    </div>
  )
}

/** Shown for the one round-trip it takes to find out whether we are signed in. */
function Splash() {
  return (
    <div className="flex h-screen items-center justify-center bg-canvas">
      <div className="flex items-center gap-2.5">
        <div className="flex size-[26px] items-center justify-center rounded-[7px] bg-ink text-[13px] leading-none font-bold text-white">
          T
        </div>
        <span className="font-mono text-[11.5px] leading-none text-ink/45">loading workspace…</span>
      </div>
    </div>
  )
}

function Screens() {
  const { state } = useApp()
  if (state.screen === 'loading') return <Splash />
  return state.screen === 'login' ? <LoginScreen /> : <Workspace />
}

export default function App() {
  return (
    <AppProvider>
      <Screens />
      <ErrorBanner />
    </AppProvider>
  )
}
