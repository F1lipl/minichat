package main

import (
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"errors"
	"os"
	"path/filepath"
	"strings"
	"time"
)

// FileMeta is the sidecar record stored next to each uploaded blob. It lets the
// download handler restore the original name and content type.
type FileMeta struct {
	ID         string `json:"id"`
	Name       string `json:"name"`
	Type       string `json:"type"`
	Size       int64  `json:"size"`
	IsImage    bool   `json:"is_image"`
	CreateTime string `json:"create_time"`
}

// Store persists uploaded blobs and their metadata on local disk.
type Store struct {
	dir string
}

func newStore(dir string) (*Store, error) {
	if err := os.MkdirAll(dir, 0o755); err != nil {
		return nil, err
	}
	return &Store{dir: dir}, nil
}

// newID returns a random 32-char hex id used as the on-disk filename.
func newID() (string, error) {
	buf := make([]byte, 16)
	if _, err := rand.Read(buf); err != nil {
		return "", err
	}
	return hex.EncodeToString(buf), nil
}

// validID guards the download path against traversal: ids are hex only.
func validID(id string) bool {
	if id == "" || len(id) > 64 {
		return false
	}
	for _, r := range id {
		isHex := (r >= '0' && r <= '9') || (r >= 'a' && r <= 'f')
		if !isHex {
			return false
		}
	}
	return true
}

func (s *Store) blobPath(id string) string { return filepath.Join(s.dir, id) }
func (s *Store) metaPath(id string) string { return filepath.Join(s.dir, id+".json") }

// Save writes the blob and its metadata, returning the populated meta.
func (s *Store) Save(name, contentType string, isImage bool, data []byte) (FileMeta, error) {
	id, err := newID()
	if err != nil {
		return FileMeta{}, err
	}

	if err := os.WriteFile(s.blobPath(id), data, 0o644); err != nil {
		return FileMeta{}, err
	}

	meta := FileMeta{
		ID:         id,
		Name:       name,
		Type:       contentType,
		Size:       int64(len(data)),
		IsImage:    isImage,
		CreateTime: time.Now().Format(time.RFC3339),
	}
	metaBytes, _ := json.Marshal(meta)
	if err := os.WriteFile(s.metaPath(id), metaBytes, 0o644); err != nil {
		// Roll back the blob so we never leave an unreferenced file.
		_ = os.Remove(s.blobPath(id))
		return FileMeta{}, err
	}
	return meta, nil
}

var errNotFound = errors.New("file not found")

// Load returns the metadata and absolute blob path for an id.
func (s *Store) Load(id string) (FileMeta, string, error) {
	if !validID(id) {
		return FileMeta{}, "", errNotFound
	}
	metaBytes, err := os.ReadFile(s.metaPath(id))
	if err != nil {
		return FileMeta{}, "", errNotFound
	}
	var meta FileMeta
	if err := json.Unmarshal(metaBytes, &meta); err != nil {
		return FileMeta{}, "", errNotFound
	}
	blob := s.blobPath(id)
	if _, err := os.Stat(blob); err != nil {
		return FileMeta{}, "", errNotFound
	}
	return meta, blob, nil
}

// extOf returns the lower-cased extension without the dot.
func extOf(name string) string {
	return strings.ToLower(strings.TrimPrefix(filepath.Ext(name), "."))
}

func isImageExt(ext string) bool {
	switch ext {
	case "jpg", "jpeg", "png", "gif", "webp", "bmp":
		return true
	default:
		return false
	}
}
