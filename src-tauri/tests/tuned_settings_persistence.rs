//! The tuned preferences use the existing settings rows and survive reopening SQLite.
use flow_desktop_lib::db::settings::{get_setting, set_setting};
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
    let keys = ["music_video_first_enabled", "keep_watching_view_enabled"];
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
        reopened.close().await;
    }
    std::fs::remove_dir_all(directory).unwrap();
}
