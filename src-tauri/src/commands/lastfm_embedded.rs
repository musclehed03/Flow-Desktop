//! Feature 13.6: the embedded Last.fm scrobbler's network pipe.
//!
//! The webview's CSP allows no outside fetch, so the frontend signs its calls
//! and posts them through here. The host is fixed below: this is not a generic
//! fetcher. Key material travels only as the call's form fields and is never
//! stored; nothing about a call is logged beyond its method and outcome.

use serde::Serialize;

use crate::api::http::shared_client;
use crate::errors::{AppError, ErrorResponse};

const LASTFM_URL: &str = "https://ws.audioscrobbler.com/2.0/";

/// The reply the frontend classifies: HTTP status plus the raw JSON body.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LastfmPostReply {
    pub status: u16,
    pub body: String,
}

#[tauri::command]
pub async fn lastfm_embedded_post(
    form: Vec<(String, String)>,
) -> Result<LastfmPostReply, ErrorResponse> {
    let method = form
        .iter()
        .find(|(name, _)| name == "method")
        .map(|(_, value)| value.clone())
        .unwrap_or_default();
    let response = shared_client()
        .post(LASTFM_URL)
        .form(&form)
        .send()
        .await
        .map_err(|error| AppError::Network(error.without_url().to_string()))?;
    let status = response.status();
    let body = response
        .text()
        .await
        .map_err(|error| AppError::Network(error.without_url().to_string()))?;
    tracing::debug!(method, %status, "Embedded Last.fm call answered");
    Ok(LastfmPostReply {
        status: status.as_u16(),
        body,
    })
}
