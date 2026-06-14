//! Error types for particle0.

use serde::Serialize;

/// All possible errors from the NIM client and app logic.
#[derive(Debug, PartialEq, thiserror::Error, Serialize)]
pub enum NimError {
    #[error("NIM server unreachable: {0}")]
    NetworkError(String),

    #[error("Authentication failed: check your API key")]
    AuthError,

    #[error("Model '{0}' not found on this endpoint")]
    ModelNotFound(String),

    #[error("Request timed out after {0}s")]
    Timeout(u64),

    #[error("Stream parse error: {0}")]
    StreamParseError(String),

    #[error("Server error: {0}")]
    ServerError(String),

    #[error("Configuration error: {0}")]
    ConfigError(String),

    #[error("Request cancelled")]
    Cancelled,
}

/// Maps NimError to a user-facing message and error_type string.
pub struct UserFacingError {
    pub message: String,
    pub error_type: String,
    pub retryable: bool,
}

impl From<&NimError> for UserFacingError {
    fn from(e: &NimError) -> Self {
        match e {
            NimError::NetworkError(_) => UserFacingError {
                message: "Cannot reach the model server.".into(),
                error_type: "network".into(),
                retryable: true,
            },
            NimError::AuthError => UserFacingError {
                message: "Authentication failed. Check your API key in Settings.".into(),
                error_type: "auth".into(),
                retryable: false,
            },
            NimError::ModelNotFound(_) => UserFacingError {
                message: "Selected model is not available.".into(),
                error_type: "model".into(),
                retryable: false,
            },
            NimError::Timeout(secs) => UserFacingError {
                message: format!("Request timed out after {secs}s. Try again or increase timeout in Settings."),
                error_type: "timeout".into(),
                retryable: true,
            },
            NimError::StreamParseError(_) => UserFacingError {
                message: "Response was corrupted. Try again.".into(),
                error_type: "parse".into(),
                retryable: true,
            },
            NimError::ServerError(_) => UserFacingError {
                message: "The model server returned an error.".into(),
                error_type: "server".into(),
                retryable: true,
            },
            NimError::ConfigError(_) => UserFacingError {
                message: "Configuration issue. Open Settings to fix.".into(),
                error_type: "config".into(),
                retryable: false,
            },
            NimError::Cancelled => UserFacingError {
                message: "Request cancelled.".into(),
                error_type: "cancelled".into(),
                retryable: false,
            },
        }
    }
}

// NimError is returned from Tauri commands as a serialized error string via Result<T, String>.

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn network_error_display() {
        let e = NimError::NetworkError("timeout".into());
        assert_eq!(e.to_string(), "NIM server unreachable: timeout");
    }

    #[test]
    fn auth_error_display() {
        assert_eq!(
            NimError::AuthError.to_string(),
            "Authentication failed: check your API key"
        );
    }

    #[test]
    fn model_not_found_display() {
        let e = NimError::ModelNotFound("gpt-x".into());
        assert_eq!(e.to_string(), "Model 'gpt-x' not found on this endpoint");
    }

    #[test]
    fn timeout_display() {
        assert_eq!(
            NimError::Timeout(30).to_string(),
            "Request timed out after 30s"
        );
    }

    #[test]
    fn cancelled_display() {
        assert_eq!(NimError::Cancelled.to_string(), "Request cancelled");
    }

    #[test]
    fn user_facing_network_is_retryable() {
        let uf = UserFacingError::from(&NimError::NetworkError("x".into()));
        assert!(uf.retryable);
        assert_eq!(uf.error_type, "network");
    }

    #[test]
    fn user_facing_auth_not_retryable() {
        let uf = UserFacingError::from(&NimError::AuthError);
        assert!(!uf.retryable);
        assert_eq!(uf.error_type, "auth");
    }

    #[test]
    fn user_facing_config_not_retryable() {
        let uf = UserFacingError::from(&NimError::ConfigError("bad".into()));
        assert!(!uf.retryable);
        assert_eq!(uf.error_type, "config");
    }

    #[test]
    fn user_facing_server_retryable() {
        let uf = UserFacingError::from(&NimError::ServerError("500".into()));
        assert!(uf.retryable);
        assert_eq!(uf.error_type, "server");
    }

    #[test]
    fn user_facing_timeout_retryable() {
        let uf = UserFacingError::from(&NimError::Timeout(30));
        assert!(uf.retryable);
        assert_eq!(uf.error_type, "timeout");
    }
}
