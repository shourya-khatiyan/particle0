//! NVIDIA NIM HTTP client — model listing, health check, and streaming chat completions.

use crate::errors::NimError;
use crate::settings::AppSettings;
use crate::state::ChatMessage;
use reqwest::Client;
use serde::Deserialize;
use std::time::Duration;

/// Distinct result for the health check endpoint.
/// NVIDIA hosted NIM does not always expose /v1/health/ready.
pub enum HealthCheckError {
    /// 404 — endpoint absent, caller should treat as non-fatal
    NotFound,
    /// Auth, network, or server error
    Other(NimError),
}

/// Model info returned by GET /v1/models.
#[derive(Debug, Deserialize)]
pub struct ModelInfo {
    pub id: String,
}

/// Response envelope from GET /v1/models.
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

/// NIM HTTP client. One instance per settings configuration.
pub struct NimClient {
    http: Client,
    pub base_url: String,
    pub api_key: String,
    pub model: String,
    timeout_secs: u64,
}

impl NimClient {
    /// Creates a new client from app settings.
    pub fn new(settings: &AppSettings) -> Self {
        let http = Client::builder()
            .timeout(Duration::from_secs(settings.request_timeout_secs))
            .build()
            .unwrap_or_else(|e| {
                log::warn!("Failed to build HTTP client with timeout: {e}, using default");
                Client::default()
            });

        NimClient {
            http,
            base_url: settings.nim_base_url.trim_end_matches('/').to_string(),
            api_key: settings.nim_api_key.clone(),
            model: settings.nim_model.clone(),
            timeout_secs: settings.request_timeout_secs,
        }
    }

    /// Creates a temporary client for connection testing.
    pub fn for_test(base_url: &str, api_key: &str) -> Self {
        let http = Client::builder()
            .timeout(Duration::from_secs(15))
            .build()
            .unwrap_or_else(|e| {
                log::warn!("Failed to build test HTTP client: {e}, using default");
                Client::default()
            });

        NimClient {
            http,
            base_url: base_url.trim_end_matches('/').to_string(),
            api_key: api_key.to_string(),
            model: String::new(),
            timeout_secs: 15,
        }
    }

    /// Checks NIM server readiness via GET {base_url}/health/ready.
    /// Returns `HealthCheckError::NotFound` for 404 — caller treats that as non-fatal.
    pub async fn check_health(&self) -> Result<bool, HealthCheckError> {
        let url = format!("{}/health/ready", self.base_url);
        let resp = self
            .http
            .get(&url)
            .bearer_auth(&self.api_key)
            .send()
            .await
            .map_err(|e| HealthCheckError::Other(NimError::NetworkError(e.to_string())))?;

        if resp.status().as_u16() == 404 {
            return Err(HealthCheckError::NotFound);
        }

        Ok(resp.status().is_success())
    }

    /// Lists available models via GET {base_url}/models.
    pub async fn list_models(&self) -> Result<Vec<ModelInfo>, NimError> {
        let url = format!("{}/models", self.base_url);
        let resp = self
            .http
            .get(&url)
            .bearer_auth(&self.api_key)
            .send()
            .await
            .map_err(|e| NimError::NetworkError(e.to_string()))?;

        match resp.status().as_u16() {
            401 | 403 => return Err(NimError::AuthError),
            404 => return Err(NimError::NetworkError("Endpoint not found".into())),
            s if s >= 500 => return Err(NimError::ServerError(format!("HTTP {s}"))),
            _ => {}
        }

        let body: ModelsResponse = resp
            .json()
            .await
            .map_err(|e| NimError::StreamParseError(e.to_string()))?;

        Ok(body.data)
    }

    /// Quick probe to verify the selected model actually responds to inference.
    /// Uses a minimal non-streaming request with a short dedicated timeout.
    pub async fn probe_model(&self) -> Result<(), NimError> {
        let url = format!("{}/chat/completions", self.base_url);
        let body = serde_json::json!({
            "model": self.model,
            "messages": [{"role": "user", "content": "hi"}],
            "stream": false,
            "max_tokens": 1,
        });

        let probe_client = Client::builder()
            .timeout(Duration::from_secs(15))
            .build()
            .unwrap_or_default();

        let resp = probe_client
            .post(&url)
            .bearer_auth(&self.api_key)
            .header("Content-Type", "application/json")
            .json(&body)
            .send()
            .await
            .map_err(|e| {
                if e.is_timeout() {
                    NimError::ModelNotFound(format!(
                        "{} (model listed but not responding to inference)",
                        self.model
                    ))
                } else {
                    NimError::NetworkError(e.to_string())
                }
            })?;

        match resp.status().as_u16() {
            200..=299 => Ok(()),
            401 | 403 => Err(NimError::AuthError),
            404 => Err(NimError::ModelNotFound(self.model.clone())),
            422 => Err(NimError::ConfigError("Invalid request parameters".into())),
            s if s >= 500 => Err(NimError::ServerError(format!("HTTP {s}"))),
            s => Err(NimError::ServerError(format!("Unexpected status {s}"))),
        }
    }

    /// Sends a streaming chat completion request.
    /// Returns an async stream of `StreamChunk`s.
    pub async fn chat_completion_stream(
        &self,
        messages: Vec<ChatMessage>,
        temperature: f32,
        max_tokens: Option<u32>,
    ) -> Result<impl futures::Stream<Item = Result<StreamChunk, NimError>>, NimError> {
        use serde_json::json;

        let url = format!("{}/chat/completions", self.base_url);

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
            .await;

        let resp = resp.map_err(|e| {
            if e.is_timeout() {
                NimError::Timeout(self.timeout_secs)
            } else {
                NimError::NetworkError(e.to_string())
            }
        })?;

        match resp.status().as_u16() {
            401 | 403 => return Err(NimError::AuthError),
            404 => return Err(NimError::ModelNotFound(self.model.clone())),
            422 => return Err(NimError::ConfigError("Invalid request parameters".into())),
            s if s >= 500 => return Err(NimError::ServerError(format!("HTTP {s}"))),
            _ => {}
        }

        let byte_stream = resp.bytes_stream();
        let chunk_stream = crate::stream_parser::parse_sse_stream(byte_stream);
        Ok(chunk_stream)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn test_settings() -> AppSettings {
        AppSettings {
            nim_base_url: "https://integrate.api.nvidia.com/v1/".into(),
            nim_api_key: "nvapi-test-key".into(),
            nim_model: "meta/llama-3.1-8b-instruct".into(),
            request_timeout_secs: 45,
            ..AppSettings::default()
        }
    }

    #[test]
    fn client_from_settings_trims_trailing_slash() {
        let client = NimClient::new(&test_settings());
        assert_eq!(client.base_url, "https://integrate.api.nvidia.com/v1");
    }

    #[test]
    fn client_copies_api_key_and_model() {
        let client = NimClient::new(&test_settings());
        assert_eq!(client.api_key, "nvapi-test-key");
        assert_eq!(client.model, "meta/llama-3.1-8b-instruct");
    }

    #[test]
    fn for_test_trims_trailing_slash() {
        let client = NimClient::for_test("https://example.com/", "key");
        assert_eq!(client.base_url, "https://example.com");
        assert_eq!(client.api_key, "key");
        assert!(client.model.is_empty());
    }

    #[test]
    fn models_response_deserialize() {
        let json = r#"{"data":[{"id":"model-a"},{"id":"model-b"}]}"#;
        let resp: ModelsResponse = serde_json::from_str(json).unwrap();
        assert_eq!(resp.data.len(), 2);
        assert_eq!(resp.data[0].id, "model-a");
        assert_eq!(resp.data[1].id, "model-b");
    }

    #[test]
    fn models_response_empty() {
        let json = r#"{"data":[]}"#;
        let resp: ModelsResponse = serde_json::from_str(json).unwrap();
        assert!(resp.data.is_empty());
    }
}
