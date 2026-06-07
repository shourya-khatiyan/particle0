//! SSE (Server-Sent Events) stream parser for NIM chat completions.
//! Converts a byte stream into a stream of parsed StreamChunks.

use crate::errors::NimError;
use crate::nim_client::StreamChunk;
use bytes::Bytes;
use futures::{Stream, StreamExt};
use serde::Deserialize;

/// Internal SSE delta content from each JSON payload.
#[derive(Debug, Deserialize)]
struct SseDelta {
    content: Option<String>,
}

#[derive(Debug, Deserialize)]
struct SseChoice {
    delta: SseDelta,
    finish_reason: Option<String>,
}

#[derive(Debug, Deserialize)]
struct SsePayload {
    choices: Vec<SseChoice>,
}

/// Parses an SSE line (after stripping "data: " prefix) into a StreamChunk.
fn parse_sse_line(line: &str) -> Option<Result<StreamChunk, NimError>> {
    let line = line.trim();

    if line.is_empty() || line.starts_with(':') {
        return None;
    }

    let data = line.strip_prefix("data: ")?;

    if data == "[DONE]" {
        return None; // Stream complete — handled by the caller
    }

    let payload: SsePayload = match serde_json::from_str(data) {
        Ok(p) => p,
        Err(e) => {
            return Some(Err(NimError::StreamParseError(format!(
                "JSON parse error: {e}, data: {data}"
            ))))
        }
    };

    let choice = payload.choices.into_iter().next()?;
    let token = choice.delta.content.unwrap_or_default();
    let finish_reason = choice.finish_reason;

    Some(Ok(StreamChunk {
        token,
        finish_reason,
    }))
}

/// Converts a raw HTTP byte stream into a stream of parsed StreamChunks.
pub fn parse_sse_stream<S, E>(byte_stream: S) -> impl Stream<Item = Result<StreamChunk, NimError>>
where
    S: Stream<Item = Result<Bytes, E>> + Unpin,
    E: std::error::Error + Send + Sync + 'static,
{
    // Buffer to accumulate partial SSE lines across chunk boundaries
    let mut buffer = String::new();

    byte_stream.flat_map(move |result| {
        let chunks: Vec<Result<StreamChunk, NimError>> = match result {
            Err(e) => vec![Err(NimError::NetworkError(e.to_string()))],
            Ok(bytes) => {
                buffer.push_str(&String::from_utf8_lossy(&bytes));

                let mut parsed = Vec::new();

                // Process all complete lines (ended by \n\n or \n)
                while let Some(pos) = buffer.find('\n') {
                    let line = buffer[..pos].to_string();
                    buffer.drain(..=pos);

                    if line.trim() == "data: [DONE]" {
                        break;
                    }

                    if let Some(result) = parse_sse_line(&line) {
                        parsed.push(result);
                    }
                }

                parsed
            }
        };

        futures::stream::iter(chunks)
    })
}
