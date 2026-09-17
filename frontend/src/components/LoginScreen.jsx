import { useState } from 'react'
import { useApp } from '../state/useApp'
import Avatar from './ui/Avatar'

/**
 * Google is the real provider. The seeded-account list below it is what makes
 * the app runnable without an OAuth client, and the server turns it off
 * (AUTH_DEV_MODE=false) rather than the client hiding it.
 */
const DEMO_ACCOUNTS = [
  { email: 'iqbal@team.co', name: 'Iqbal', init: 'IQ', color: '#8c8c8c' },
  { email: 'welby@team.co', name: 'Welby', init: 'WE', color: '#7a4a9c' },
  { email: 'shauma@team.co', name: 'Shauma', init: 'SH', color: '#2f6f9f' },
]

export default function LoginScreen() {
  const { state, actions } = useApp()
  const [email, setEmail] = useState('')
  const devAuth = state.providers.dev

  const signIn = (address) => {
    if (!address.includes('@')) return
    actions.signInAs(address)
  }

  return (
    <div className="grid min-h-screen grid-cols-1 bg-canvas lg:grid-cols-[1.05fr_.95fr]">
      <div className="flex flex-col justify-between gap-12 bg-shell px-8 py-11 text-shell-ink lg:px-13">
        <div className="flex items-center gap-2.5">
          <div className="flex size-[26px] items-center justify-center rounded-[7px] bg-ink text-[13px] leading-none font-bold text-white">
            T
          </div>
          <span className="text-[15px] leading-none font-semibold tracking-[-.01em]">Taskspace</span>
        </div>

        <div className="flex max-w-[420px] flex-col gap-[22px]">
          <h1 className="m-0 text-[40px] leading-[1.12] font-semibold tracking-[-.02em] text-pretty">
            Tasks, files and conversation in one small place.
          </h1>
          <p className="m-0 text-[15px] leading-[1.65] text-shell-ink/66 text-pretty">
            Built for teams of three to ten. One workspace per stream of work, statuses you define
            yourself, and chat that can point straight at a task.
          </p>
          <div className="flex items-center gap-2 pt-1.5">
            <div className="flex">
              {DEMO_ACCOUNTS.map((person, index) => (
                <Avatar
                  key={person.email}
                  init={person.init}
                  color={person.color}
                  size={28}
                  className={`border-2 border-shell ${index > 0 ? '-ml-2' : ''}`}
                />
              ))}
            </div>
            <span className="text-[12.5px] leading-none text-shell-ink/50">
              Iqbal, Welby and Shauma are already here
            </span>
          </div>
        </div>

        <span className="font-mono text-[11.5px] leading-none text-shell-ink/34">
          v1.4 · internal build
        </span>
      </div>

      <div className="flex items-center justify-center p-10">
        <div className="flex w-full max-w-[360px] flex-col gap-6">
          <div className="flex flex-col gap-[7px]">
            <h2 className="m-0 text-2xl leading-[1.2] font-semibold tracking-[-.015em]">Sign in</h2>
            <p className="m-0 text-[13.5px] leading-[1.5] text-ink/55">
              Taskspace uses your Google Workspace account. No separate password to manage.
            </p>
          </div>

          {state.authError && (
            <div
              role="alert"
              className="flex flex-col gap-1 rounded-[10px] border border-ink/22 bg-[#f4f4f3] px-[15px] py-3"
            >
              <span className="text-[12.5px] leading-[1.45] font-medium">{state.authError}</span>
            </div>
          )}

          <div className="flex flex-col gap-3">
            <button
              type="button"
              disabled={!state.providers.google || state.signingIn}
              onClick={actions.signInWithGoogle}
              className="flex cursor-pointer items-center justify-center gap-[11px] rounded-lg border border-ink/18 bg-panel px-[18px] py-[13px] text-sm leading-none font-semibold hover:border-ink/40 hover:bg-subtle disabled:cursor-not-allowed disabled:opacity-45 disabled:hover:border-ink/18 disabled:hover:bg-panel"
            >
              <span className="flex size-[18px] flex-none items-center justify-center rounded-full bg-ink text-[10px] leading-none font-bold text-white">
                G
              </span>
              Continue with Google
            </button>
            <span className="text-xs leading-[1.55] text-ink/50 text-pretty">
              {state.providers.google
                ? 'First time signing in creates your account. Existing members go straight to their workspaces.'
                : 'Google sign-in is not configured on this server. Use an account below.'}
            </span>
          </div>

          {devAuth && (
            <div className="flex flex-col gap-2.5 rounded-[10px] border border-ink/10 bg-subtle px-[15px] py-3.5">
              <span className="font-mono text-[10px] leading-none font-medium tracking-[.09em] text-ink/42 uppercase">
                Accounts on this server
              </span>

              {DEMO_ACCOUNTS.map((person) => (
                <button
                  key={person.email}
                  type="button"
                  disabled={state.signingIn}
                  onClick={() => signIn(person.email)}
                  className="-mx-2 flex cursor-pointer items-center gap-[11px] rounded-lg bg-transparent p-2 text-left hover:bg-canvas disabled:cursor-wait"
                >
                  <Avatar init={person.init} color={person.color} size={32} />
                  <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <span className="text-[13px] leading-[1.2] font-medium">{person.name}</span>
                    <span className="font-mono text-[11.5px] leading-none text-ink/45">
                      {person.email}
                    </span>
                  </span>
                  <span aria-hidden="true" className="text-xs text-ink/35">
                    →
                  </span>
                </button>
              ))}

              <form
                onSubmit={(event) => {
                  event.preventDefault()
                  signIn(email.trim())
                }}
                className="flex items-center gap-1.5 border-t border-ink/8 pt-2.5"
              >
                <input
                  type="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder="or any email address"
                  aria-label="Sign in with an email address"
                  className="min-w-0 flex-1 rounded-md border border-ink/14 bg-panel px-2.5 py-2 font-mono text-[11.5px] leading-none outline-none"
                />
                <button
                  type="submit"
                  disabled={!email.includes('@') || state.signingIn}
                  className="cursor-pointer rounded-md bg-ink px-2.5 py-2 text-[11.5px] leading-none font-semibold text-white disabled:cursor-not-allowed disabled:bg-ink/30"
                >
                  Go
                </button>
              </form>
            </div>
          )}

          <p className="m-0 text-xs leading-[1.5] text-ink/45">
            Workspace access is granted by invite. Ask an admin if you cannot see one.
          </p>
        </div>
      </div>
    </div>
  )
}
