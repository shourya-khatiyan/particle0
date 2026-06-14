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
/// Chains a trailing newline sentinel so buffered content is flushed even if the
/// upstream ends without a final line break.
pub fn parse_sse_stream<S, E>(byte_stream: S) -> impl Stream<Item = Result<StreamChunk, NimError>>
where
    S: Stream<Item = Result<Bytes, E>> + Unpin,
    E: std::error::Error + Send + Sync + 'static,
{
    // Buffer to accumulate partial SSE lines across chunk boundaries
    let mut buffer = String::new();

    // Append a trailing newline so any partial line left in the buffer gets processed
    let stream_with_sentinel = byte_stream.chain(futures::stream::iter(
        std::iter::once(Ok(Bytes::from_static(b"\n")))
    ));

    stream_with_sentinel.flat_map(move |result| {
        let chunks: Vec<Result<StreamChunk, NimError>> = match result {
            Err(e) => vec![Err(NimError::NetworkError(e.to_string()))],
            Ok(bytes) => {
                buffer.push_str(&String::from_utf8_lossy(&bytes));

                let mut parsed = Vec::new();

                // Process all complete lines (ended by \n)
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

#[cfg(test)]
mod tests {
    use super::*;
    use futures::stream;

    /// Helper: parse a single SSE data line and return the result.
    fn parse(line: &str) -> Option<Result<StreamChunk, NimError>> {
        parse_sse_line(line)
    }

    #[test]
    fn parse_single_token() {
        let line = r#"data: {"choices":[{"delta":{"content":"Hello"},"finish_reason":null}]}"#;
        let result = parse(line).expect("should produce a chunk");
        let chunk = result.expect("should be Ok");
        assert_eq!(chunk.token, "Hello");
        assert!(chunk.finish_reason.is_none());
    }

    #[test]
    fn parse_token_with_finish_reason() {
        let line = r#"data: {"choices":[{"delta":{"content":" world"},"finish_reason":"stop"}]}"#;
        let chunk = parse(line).unwrap().unwrap();
        assert_eq!(chunk.token, " world");
        assert_eq!(chunk.finish_reason.as_deref(), Some("stop"));
    }

    #[test]
    fn parse_empty_content() {
        let line = r#"data: {"choices":[{"delta":{"content":""},"finish_reason":null}]}"#;
        let chunk = parse(line).unwrap().unwrap();
        assert_eq!(chunk.token, "");
    }

    #[test]
    fn parse_null_content_yields_empty() {
        let line = r#"data: {"choices":[{"delta":{},"finish_reason":null}]}"#;
        let chunk = parse(line).unwrap().unwrap();
        assert_eq!(chunk.token, "");
    }

    #[test]
    fn parse_done_returns_none() {
        assert!(parse("data: [DONE]").is_none());
    }

    #[test]
    fn parse_sse_comment_ignored() {
        assert!(parse(": this is a comment").is_none());
    }

    #[test]
    fn parse_empty_line_ignored() {
        assert!(parse("").is_none());
        assert!(parse("   ").is_none());
    }

    #[test]
    fn parse_non_data_line_ignored() {
        assert!(parse("event: ping").is_none());
    }

    #[test]
    fn parse_malformed_json_returns_error() {
        let line = "data: {not valid json}";
        let result = parse(line).expect("should produce a result");
        assert!(result.is_err());
        match result.unwrap_err() {
            NimError::StreamParseError(msg) => assert!(msg.contains("JSON parse error")),
            other => panic!("expected StreamParseError, got: {:?}", other),
        }
    }

    #[tokio::test]
    async fn parse_sse_stream_multiple_chunks() {
        let raw = "data: {\"choices\":[{\"delta\":{\"content\":\"Hello\"},\"finish_reason\":null}]}\n\
                   data: {\"choices\":[{\"delta\":{\"content\":\" world\"},\"finish_reason\":null}]}\n\
                   data: [DONE]\n";

        let byte_stream = stream::iter(vec![Ok::<Bytes, std::io::Error>(Bytes::from(raw))]);
        let mut chunks: Vec<Result<StreamChunk, NimError>> =
            parse_sse_stream(byte_stream).collect().await;

        assert_eq!(chunks.len(), 2);
        assert_eq!(chunks.remove(0).unwrap().token, "Hello");
        assert_eq!(chunks.remove(0).unwrap().token, " world");
    }

    #[tokio::test]
    async fn parse_sse_stream_split_across_byte_boundaries() {
        let part1 = "data: {\"choices\":[{\"delta\":{\"content\":\"Hi\"},\"fini";
        let part2 = "sh_reason\":null}]}\ndata: [DONE]\n";

        let byte_stream = stream::iter(vec![
            Ok::<Bytes, std::io::Error>(Bytes::from(part1)),
            Ok::<Bytes, std::io::Error>(Bytes::from(part2)),
        ]);

        let chunks: Vec<Result<StreamChunk, NimError>> =
            parse_sse_stream(byte_stream).collect().await;

        assert_eq!(chunks.len(), 1);
        assert_eq!(chunks[0].as_ref().unwrap().token, "Hi");
    }

    #[tokio::test]
    async fn parse_sse_stream_network_error() {
        let byte_stream = stream::iter(vec![
            Err::<Bytes, std::io::Error>(std::io::Error::new(
                std::io::ErrorKind::ConnectionReset,
                "reset",
            )),
        ]);

        let chunks: Vec<Result<StreamChunk, NimError>> =
            parse_sse_stream(byte_stream).collect().await;

        assert_eq!(chunks.len(), 1);
        assert!(chunks[0].is_err());
    }
}
