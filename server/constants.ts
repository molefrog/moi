export const PORT = Number(process.env.PORT) || 13337
// M=13, E=5, I=9 -> 13059. Overridable like PORT so a test can bring up a
// throwaway server beside a real one; server and CLI read this same module, so
// a process given the override binds and dials the same port either way.
export const CONTROL_PORT = Number(process.env.MOI_CONTROL_PORT) || 13059
// The address the control server binds AND the one every client dials — never
// the name `localhost`. Resolution of that name is not guaranteed: container
// images ship an /etc/hosts without a `localhost` entry (Bun's resolver, unlike
// glibc, does not special-case it), and where it does resolve it may prefer
// ::1 while the control server listens on IPv4 only. Bind and dial read this
// same constant so the two can never drift apart.
export const CONTROL_HOST = '127.0.0.1'
export const CONTROL_URL = `ws://${CONTROL_HOST}:${CONTROL_PORT}`
