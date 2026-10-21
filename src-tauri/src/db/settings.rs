use crate::errors::{AppError, AppResult};
use sqlx::SqlitePool;

pub async fn set_setting(pool: &SqlitePool, key: &str, value: &str) -> AppResult<()> {
    sqlx::query(
        "INSERT INTO settings (key, value, updated_at)
         VALUES (?, ?, CURRENT_TIMESTAMP)
         ON CONFLICT(key) DO UPDATE SET 
            value = excluded.value,
            updated_at = CURRENT_TIMESTAMP",
    )
    .bind(key)
    .bind(value)
    .execute(pool)
    .await
    .map_err(AppError::from)?;

    Ok(())
}

pub async fn get_setting(pool: &SqlitePool, key: &str) -> AppResult<Option<String>> {
    let row = sqlx::query("SELECT value FROM settings WHERE key = ? LIMIT 1")
        .bind(key)
        .fetch_optional(pool)
        .await
        .map_err(AppError::from)?;

    if let Some(r) = row {
        let value: String = sqlx::Row::get(&r, 0);
        Ok(Some(value))
    } else {
        Ok(None)
    }
}

#[allow(dead_code)]
pub async fn clear_settings(pool: &SqlitePool) -> AppResult<()> {
    sqlx::query("DELETE FROM settings")
        .execute(pool)
        .await
        .map_err(AppError::from)?;

    Ok(())
}

#[cfg(test)]
mod tuned_tests {
    use super::{get_setting, set_setting};
    use sqlx::sqlite::SqlitePoolOptions;
    #[tokio::test]
    async fn tuned_player_settings_survive_database_restart() {
        let directory = std::env::temp_dir().join(format!(
            "flow-tuned-settings-{}-{}",
            std::process::id(),
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        std::fs::create_dir_all(&directory).unwrap();
        let url = format!(
            "sqlite://{}?mode=rwc",
            directory.join("test.sqlite").display()
        );
        let keys = [
            "music_video_first_enabled",
            "keep_watching_view_enabled",
            "sensory_focus_enabled",
            "safe_motion_enabled",
            "readable_font_enabled",
            "high_contrast_enabled",
            "color_blind_enabled",
            "simplified_view_enabled",
            "genius_dj_enabled",
            "music_crossfade_enabled",
            "music_crossfade_everything",
        ];
        for value in ["false", "true"] {
            let pool = SqlitePoolOptions::new()
                .max_connections(1)
                .connect(&url)
                .await
                .unwrap();
            sqlx::migrate!("./migrations").run(&pool).await.unwrap();
            for key in keys {
                set_setting(&pool, key, value).await.unwrap();
            }
            for (key, text) in [
                ("radio_discovery_level", "more"),
                ("music_crossfade_seconds", "8"),
                ("music_visualizer_config", r#"{"family":"radial","fps":30}"#),
                (
                    "music_visualizer_presets",
                    r#"[{"name":"Noir","config":{"family":"waveform"}}]"#,
                ),
                ("theme_variant", "light"),
                (
                    "saved_radio_stations",
                    r#"[{"id":"station","name":"Rock/Metal","discovery":"more","station":{"type":"genre","seed":{"id":"seed"},"browseId":"genre"}}]"#,
                ),
            ] {
                set_setting(&pool, key, text).await.unwrap();
            }
            pool.close().await;

            let reopened = SqlitePoolOptions::new()
                .max_connections(1)
                .connect(&url)
                .await
                .unwrap();
            for key in keys {
                let row: String = sqlx::query_scalar("SELECT value FROM settings WHERE key = ?")
                    .bind(key)
                    .fetch_one(&reopened)
                    .await
                    .unwrap();
                assert_eq!(row, value);
                assert_eq!(
                    get_setting(&reopened, key).await.unwrap().as_deref(),
                    Some(value)
                );
            }
            assert_eq!(
                get_setting(&reopened, "radio_discovery_level")
                    .await
                    .unwrap()
                    .as_deref(),
                Some("more")
            );
            assert_eq!(
                get_setting(&reopened, "theme_variant")
                    .await
                    .unwrap()
                    .as_deref(),
                Some("light")
            );
            assert_eq!(
                get_setting(&reopened, "music_crossfade_seconds")
                    .await
                    .unwrap()
                    .as_deref(),
                Some("8")
            );
            assert_eq!(
                get_setting(&reopened, "music_visualizer_config")
                    .await
                    .unwrap()
                    .as_deref(),
                Some(r#"{"family":"radial","fps":30}"#)
            );
            assert!(
                get_setting(&reopened, "music_visualizer_presets")
                    .await
                    .unwrap()
                    .unwrap()
                    .contains("Noir")
            );
            let stations = get_setting(&reopened, "saved_radio_stations")
                .await
                .unwrap()
                .unwrap();
            assert_eq!(
                serde_json::from_str::<serde_json::Value>(&stations).unwrap()[0]["name"],
                "Rock/Metal"
            );
            reopened.close().await;
        }
        std::fs::remove_dir_all(directory).unwrap();
    }
}
