/**
 * Shared shutdown state so the long-lived clients (Postgres, Redis) can tell a
 * normal runtime error apart from an error triggered while the process is
 * already draining (and must not process.exit() mid-shutdown).
 */

let shutting_down = false;

export function mark_shutting_down() {
    shutting_down = true;
}

export function is_shutting_down() {
    return shutting_down;
}
