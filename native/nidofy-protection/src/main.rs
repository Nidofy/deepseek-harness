//! One bounded command over inherited private pipes; never an HTTP listener or Agent engine.
mod task_snapshots;
use std::{io::{self, Read}, path::PathBuf};
use serde::Deserialize;

#[derive(Deserialize)]
#[serde(tag = "action", rename_all = "camelCase", deny_unknown_fields)]
enum Command {
    Ui { request: task_snapshots::Request },
    Resolve { workspace: PathBuf },
    Begin { workspace: PathBuf, binding: task_snapshots::TaskBinding, #[serde(rename="expiresAt")] expires_at: u64 },
    End { id: String, binding: task_snapshots::TaskBinding, #[serde(rename="expiresAt")] expires_at: u64 },
    Check { id: String, binding: task_snapshots::TaskBinding },
}
fn run() -> Result<serde_json::Value, String> {
    let home = std::env::args_os().nth(1).map(PathBuf::from).ok_or("home required")?;
    let mut bytes = Vec::new();
    io::stdin().take(65537).read_to_end(&mut bytes).map_err(|_| "read failed")?;
    if bytes.len() > 65536 { return Err("request too large".into()); }
    let command: Command = serde_json::from_slice(&bytes).map_err(|_| "invalid command")?;
    match command {
        Command::Ui { request } => task_snapshots::dispatch(&home, request),
        Command::Resolve { workspace } => task_snapshots::admission(&home, &workspace),
        Command::Begin { workspace, binding, expires_at } => task_snapshots::begin(&home, &workspace, binding, expires_at),
        Command::End { id, binding, expires_at } => {
            task_snapshots::Store::open(&home)?.seal_task(&id, &binding, expires_at)?;
            Ok(serde_json::json!({"status":"SEALED"}))
        },
        Command::Check { id, binding } => {
            task_snapshots::check(&home, &id, &binding)?;
            Ok(serde_json::json!({"status":"CONFIRMED"}))
        },
    }
}
fn main() {
    let output = match run() {
        Ok(value) => serde_json::json!({"ok":true,"value":value}),
        Err(_) => serde_json::json!({"ok":false,"error":"PROTECTION_UNAVAILABLE"}),
    };
    println!("{}", output);
}
