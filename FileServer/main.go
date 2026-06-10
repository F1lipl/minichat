package main

import (
	"encoding/json"
	"fmt"
	"log"
	"mime"
	"net/http"
	"net/url"
	"strings"
)

type server struct {
	cfg     Config
	store   *Store
	allowed map[string]bool
}

func main() {
	cfg := loadConfig("config.json")
	store, err := newStore(cfg.StorageDir)
	if err != nil {
		log.Fatalf("init storage failed: %v", err)
	}

	s := &server{cfg: cfg, store: store, allowed: cfg.allowedSet()}

	mux := http.NewServeMux()
	mux.HandleFunc("/health", s.handleHealth)
	mux.HandleFunc("/upload", s.handleUpload)
	mux.HandleFunc("/files/", s.handleDownload)

	addr := fmt.Sprintf(":%d", cfg.Port)
	log.Printf("FileServer listening on %s, storage=%s, maxUpload=%dMB",
		addr, cfg.StorageDir, cfg.MaxUploadMB)
	if err := http.ListenAndServe(addr, mux); err != nil {
		log.Fatalf("server stopped: %v", err)
	}
}

func (s *server) handleHealth(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, http.StatusOK, map[string]any{"error": 0, "status": "ok"})
}

// handleUpload accepts a multipart form with a single "file" field, validates
// size and extension, stores the blob, and returns its metadata.
func (s *server) handleUpload(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		writeError(w, http.StatusMethodNotAllowed, "method not allowed")
		return
	}

	maxBytes := s.cfg.maxUploadBytes()
	// Reject oversized bodies before buffering them.
	r.Body = http.MaxBytesReader(w, r.Body, maxBytes+1024)
	if err := r.ParseMultipartForm(8 << 20); err != nil {
		writeError(w, http.StatusBadRequest, "解析上传内容失败（可能超过大小限制）")
		return
	}

	file, header, err := r.FormFile("file")
	if err != nil {
		writeError(w, http.StatusBadRequest, "缺少上传文件字段 file")
		return
	}
	defer file.Close()

	if header.Size > maxBytes {
		writeError(w, http.StatusRequestEntityTooLarge,
			fmt.Sprintf("文件超过大小限制 %dMB", s.cfg.MaxUploadMB))
		return
	}

	ext := extOf(header.Filename)
	if !s.allowed[ext] {
		writeError(w, http.StatusUnsupportedMediaType, "不支持的文件类型："+ext)
		return
	}

	data := make([]byte, 0, header.Size)
	buf := make([]byte, 32*1024)
	for {
		n, readErr := file.Read(buf)
		if n > 0 {
			data = append(data, buf[:n]...)
			if int64(len(data)) > maxBytes {
				writeError(w, http.StatusRequestEntityTooLarge,
					fmt.Sprintf("文件超过大小限制 %dMB", s.cfg.MaxUploadMB))
				return
			}
		}
		if readErr != nil {
			break
		}
	}

	contentType := mime.TypeByExtension("." + ext)
	if contentType == "" {
		contentType = "application/octet-stream"
	}
	isImage := isImageExt(ext)

	meta, err := s.store.Save(header.Filename, contentType, isImage, data)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "保存文件失败")
		return
	}

	writeJSON(w, http.StatusOK, map[string]any{
		"error":    0,
		"file_id":  meta.ID,
		"name":     meta.Name,
		"size":     meta.Size,
		"type":     meta.Type,
		"is_image": meta.IsImage,
	})
}

// handleDownload serves a stored blob, restoring its content type and original
// filename. Images are served inline; everything else as an attachment.
func (s *server) handleDownload(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		writeError(w, http.StatusMethodNotAllowed, "method not allowed")
		return
	}

	id := r.URL.Path[len("/files/"):]
	meta, blob, err := s.store.Load(id)
	if err != nil {
		writeError(w, http.StatusNotFound, "文件不存在")
		return
	}

	w.Header().Set("Content-Type", meta.Type)
	disposition := "attachment"
	if meta.IsImage {
		disposition = "inline"
	}
	// RFC 5987 filename* keeps non-ASCII names intact.
	w.Header().Set("Content-Disposition",
		fmt.Sprintf("%s; filename*=UTF-8''%s", disposition, urlEncode(meta.Name)))
	http.ServeFile(w, r, blob)
}

// urlEncode percent-encodes a filename for an RFC 5987 Content-Disposition.
func urlEncode(s string) string {
	return strings.ReplaceAll(url.QueryEscape(s), "+", "%20")
}

func writeJSON(w http.ResponseWriter, status int, payload any) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(payload)
}

func writeError(w http.ResponseWriter, status int, message string) {
	writeJSON(w, status, map[string]any{"error": status, "message": message})
}
