import { AppProvider } from './state/AppProvider'
import { useApp } from './state/useApp'
import ChatDock from './components/ChatDock'
import ConfirmDialog from './components/ConfirmDialog'
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

  return (
    <div className="flex h-screen min-h-[640px] overflow-hidden bg-canvas">
      <Sidebar />

      <main className="relative flex min-w-0 flex-1 flex-col overflow-hidden">
        {state.screen === 'workspaces' && <WorkspacesScreen />}
        {state.screen === 'tasks' && <TasksScreen />}
        {state.screen === 'files' && <FilesScreen />}
        {state.screen === 'settings' && <SettingsScreen />}

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

function Screens() {
  const { state } = useApp()
  return state.screen === 'login' ? <LoginScreen /> : <Workspace />
}

export default function App() {
  return (
    <AppProvider>
      <Screens />
    </AppProvider>
  )
}
