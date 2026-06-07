//! NVIDIA NIM HTTP client — model listing, health check, and streaming chat completions.

use crate::errors::NimError;
use crate::settings::AppSettings;
use crate::state::ChatMessage;
use reqwest::Client;
use serde::Deserialize;
use std::time::Duration;

/// Model info returned by GET /v1/models.
#[derive(Debug, Deserialize)]
pub struct ModelInfo {
    pub id: String,
}

/// Response from GET /v1/models.
#[derive(Debug, Deserialize)]
struct ModelsResponse {
    data: Vec<ModelInfo>,
}

/// A parsed streaming chunk from the SSE response.
#[derive(Debug)]
pub struct StreamChunk {
    pub token: String,
    pub finish_reason: Option<String>,
}

/// NIM HTTP client. Reuse one instance per settings configuration.
pub struct NimClient {
    http: Client,
    pub base_url: String,
    pub api_key: String,
    pub model: String,
    pub timeout: Duration,
}

impl NimClient {
    /// Creates a new client from app settings.
    pub fn new(settings: &AppSettings) -> Self {
        let http = Client::builder()
            .timeout(Duration::from_secs(settings.request_timeout_secs))
            .build()
            .unwrap_or_default();

        NimClient {
            http,
            base_url: settings.nim_base_url.trim_end_matches('/').to_string(),
            api_key: settings.nim_api_key.clone(),
            model: settings.nim_model.clone(),
            timeout: Duration::from_secs(settings.request_timeout_secs),
        }
    }

    /// Creates a temporary client for testing with provided credentials.
    pub fn for_test(base_url: &str, api_key: &str) -> Self {
        let http = Client::builder()
            .timeout(Duration::from_secs(10))
            .build()
            .unwrap_or_default();

        NimClient {
            http,
            base_url: base_url.trim_end_matches('/').to_string(),
            api_key: api_key.to_string(),
            model: String::new(),
            timeout: Duration::from_secs(10),
        }
    }

    /// Checks if the NIM server is reachable via GET /v1/health/ready.
    pub async fn check_health(&self) -> Result<bool, NimError> {
        let url = format!("{}/v1/health/ready", self.base_url);
        let resp = self
            .http
            .get(&url)
            .bearer_auth(&self.api_key)
            .send()
            .await
            .map_err(|e| NimError::NetworkError(e.to_string()))?;

        Ok(resp.status().is_success())
    }

    /// Lists available models via GET /v1/models.
    pub async fn list_models(&self) -> Result<Vec<ModelInfo>, NimError> {
        let url = format!("{}/v1/models", self.base_url);
        let resp = self
            .http
            .get(&url)
            .bearer_auth(&self.api_key)
            .send()
            .await
            .map_err(|e| NimError::NetworkError(e.to_string()))?;

        match resp.status().as_u16() {
            401 | 403 => return Err(NimError::AuthError),
            s if s >= 500 => return Err(NimError::ServerError(format!("HTTP {s}"))),
            _ => {}
        }

        let body: ModelsResponse = resp
            .json()
            .await
            .map_err(|e| NimError::StreamParseError(e.to_string()))?;

        Ok(body.data)
    }

    /// Sends a streaming chat completion request.
    /// Returns an async stream of StreamChunks.
    pub async fn chat_completion_stream(
        &self,
        messages: Vec<ChatMessage>,
        temperature: f32,
        max_tokens: Option<u32>,
    ) -> Result<impl futures::Stream<Item = Result<StreamChunk, NimError>>, NimError> {
        use serde_json::json;

        let url = format!("{}/v1/chat/completions", self.base_url);

        let mut body = json!({
            "model": self.model,
            "messages": messages,
            "stream": true,
            "temperature": temperature,
        });

        if let Some(mt) = max_tokens {
            body["max_tokens"] = json!(mt);
        }

        let resp = self
            .http
            .post(&url)
            .bearer_auth(&self.api_key)
            .header("Accept", "text/event-stream")
            .json(&body)
            .send()
            .await
            .map_err(|e| NimError::NetworkError(e.to_string()))?;

        match resp.status().as_u16() {
            401 | 403 => return Err(NimError::AuthError),
            404 => return Err(NimError::ModelNotFound(self.model.clone())),
            s if s >= 500 => return Err(NimError::ServerError(format!("HTTP {s}"))),
            _ => {}
        }

        // Convert the response byte stream into a stream of StreamChunks
        let byte_stream = resp.bytes_stream();
        let chunk_stream = crate::stream_parser::parse_sse_stream(byte_stream);

        Ok(chunk_stream)
    }
}
