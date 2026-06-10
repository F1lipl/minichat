package main

import (
	"encoding/json"
	"os"
	"strconv"
	"strings"
)

// Config controls the file service. It is loaded from config.json when present,
// falling back to built-in defaults, and can be overridden by environment
// variables (FILESERVER_PORT / FILESERVER_STORAGE_DIR / FILESERVER_MAX_UPLOAD_MB).
type Config struct {
	Port        int      `json:"port"`
	StorageDir  string   `json:"storage_dir"`
	MaxUploadMB int      `json:"max_upload_mb"`
	AllowedExt  []string `json:"allowed_ext"`
}

func defaultConfig() Config {
	return Config{
		Port:        8070,
		StorageDir:  "./storage",
		MaxUploadMB: 20,
		AllowedExt: []string{
			// images (rendered inline by the client)
			"jpg", "jpeg", "png", "gif", "webp", "bmp",
			// common documents / archives (shown as a downloadable card)
			"pdf", "txt", "md", "doc", "docx", "xls", "xlsx",
			"ppt", "pptx", "zip", "rar", "7z", "csv", "json",
			// media
			"mp3", "mp4", "wav",
		},
	}
}

func loadConfig(path string) Config {
	cfg := defaultConfig()

	if data, err := os.ReadFile(path); err == nil {
		_ = json.Unmarshal(data, &cfg)
	}

	if v := os.Getenv("FILESERVER_PORT"); v != "" {
		if p, err := strconv.Atoi(v); err == nil && p > 0 {
			cfg.Port = p
		}
	}
	if v := os.Getenv("FILESERVER_STORAGE_DIR"); v != "" {
		cfg.StorageDir = v
	}
	if v := os.Getenv("FILESERVER_MAX_UPLOAD_MB"); v != "" {
		if mb, err := strconv.Atoi(v); err == nil && mb > 0 {
			cfg.MaxUploadMB = mb
		}
	}

	return cfg
}

// allowedSet builds a lower-cased lookup set of permitted extensions.
func (c Config) allowedSet() map[string]bool {
	set := make(map[string]bool, len(c.AllowedExt))
	for _, ext := range c.AllowedExt {
		set[strings.ToLower(strings.TrimPrefix(ext, "."))] = true
	}
	return set
}

func (c Config) maxUploadBytes() int64 {
	return int64(c.MaxUploadMB) * 1024 * 1024
}
