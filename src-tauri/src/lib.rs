use rodio::{Decoder, OutputStream, Sink};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::path::PathBuf;
use std::sync::{Arc, Mutex};
use tauri::State;
use walkdir::WalkDir;
use lofty::{read_from_path, file::AudioFile, tag::Accessor};
use base64::{engine::general_purpose, Engine as _};
use lofty::file::TaggedFileExt;
#[derive(Serialize, Deserialize)]
struct Library {
    audiobooks: Vec<String>,
}

#[tauri::command]
fn save_library(audiobooks: Vec<String>) -> Result<(), String> {
    let path = "library.json";
    let contents = serde_json::to_string_pretty(&audiobooks).map_err(|e| e.to_string())?;
    std::fs::write(path, contents).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
fn load_library() -> Result<Vec<String>, String> {
    let path = "library.json";
    match std::fs::read_to_string(path) {
        Ok(contents) => {
            let audiobooks: Vec<String> = serde_json::from_str(&contents).map_err(|e| e.to_string())?;
            Ok(audiobooks)
        }
        Err(_) => Ok(vec![]),
    }
}

#[tauri::command]
fn scan_folder(folder_path: String) -> Vec<String> {
    WalkDir::new(folder_path)
        .into_iter()
        .filter_map(|entry| {
            let entry = entry.ok()?;
            let path = entry.path();
            if path.extension()?.to_str()? == "mp3" {
                Some(path.to_string_lossy().to_string())
            } else {
                None
            }
        })
        .collect()
}

struct AudioPlayer {
    sink: Arc<Mutex<Option<Sink>>>,
}

impl AudioPlayer {
    fn new() -> Self {
        Self {
            sink: Arc::new(Mutex::new(None)),
        }
    }

    fn play(&self, file_path: String) -> Result<(), String> {
        let (_stream, stream_handle) = OutputStream::try_default().map_err(|e| e.to_string())?;
        let file = std::fs::File::open(file_path).map_err(|e| e.to_string())?;
        let source = Decoder::new(std::io::BufReader::new(file)).map_err(|e| e.to_string())?;

        let sink = Sink::try_new(&stream_handle).map_err(|e| e.to_string())?;
        sink.append(source);
        sink.play();

        *self.sink.lock().unwrap() = Some(sink);
        Ok(())
    }

    fn stop(&self) {
        if let Some(sink) = self.sink.lock().unwrap().take() {
            sink.stop();
        }
    }
}

#[tauri::command]
fn play_audio(file_path: String, state: State<'_, Arc<AudioPlayer>>) -> Result<(), String> {
    state.play(file_path)
}

#[tauri::command]
fn stop_audio(state: State<'_, Arc<AudioPlayer>>) {
    state.stop();
}

#[tauri::command]
async fn parse_metadata(path: String) -> Result<Value, String> {
    let path = PathBuf::from(path);
    let tagged_file = read_from_path(&path).map_err(|e| e.to_string())?;
    let tag = tagged_file.primary_tag()
        .or_else(|| tagged_file.first_tag())
        .ok_or("No tags found in audio file")?;
    let duration_secs = tagged_file.properties().duration().as_secs_f64();
    
    let duration_formatted = format!(
        "{:02}:{:02}",
        duration_secs as u32 / 3600,
        (duration_secs as u32 % 3600) / 60
    );

    let mut metadata = serde_json::json!({
        "title": tag.title().map(|s| s.to_string()),
        "author": tag.artist().map(|s| s.to_string()),
        "album": tag.album().map(|s| s.to_string()),
        "track": tag.track(),
        "comment": tag.comment().map(|s| s.to_string()),
        "duration": duration_formatted
    });

    if let Some(picture) = tag.pictures().first() {
        let mime_type = picture.mime_type().unwrap_or(&lofty::picture::MimeType::Jpeg);
        metadata["cover"] = serde_json::json!(format!(
            "data:{};base64,{}",
            mime_type.to_string(),
            general_purpose::STANDARD.encode(picture.data())
        ));
    }

    Ok(metadata)
}


#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}
#[tauri::command]
fn write_debug_log(message: String) {
    println!("[DEBUG] {}", message);
}
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .manage(Arc::new(AudioPlayer::new()))
        .invoke_handler(tauri::generate_handler![
            greet,
            load_library,
            save_library,
            scan_folder,
            play_audio,
            stop_audio,
            parse_metadata, 
            write_debug_log
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}