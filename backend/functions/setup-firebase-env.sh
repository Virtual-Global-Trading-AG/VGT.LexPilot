# Firebase Functions Environment Setup Script

#!/bin/bash

# LexPilot Firebase Functions Setup Script
# Dieses Script hilft beim Einrichten der Umgebungsvariablen für Firebase Functions

set -e

echo "🚀 LexPilot Firebase Functions Setup"
echo "====================================="

# Farben für Output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Hilfsfunktionen
print_step() {
    echo -e "${BLUE}📋 $1${NC}"
}

print_success() {
    echo -e "${GREEN}✅ $1${NC}"
}

print_warning() {
    echo -e "${YELLOW}⚠️  $1${NC}"
}

print_error() {
    echo -e "${RED}❌ $1${NC}"
}

# Überprüfen ob .env existiert
check_env_file() {
    if [ ! -f ".env" ]; then
        print_error ".env-Datei nicht gefunden!"
        echo "Bitte erstellen Sie zuerst eine .env-Datei basierend auf .env.example"
        echo "cp .env.example .env"
        exit 1
    fi
    print_success ".env-Datei gefunden"
}

# Überprüfen ob Firebase CLI installiert ist
check_firebase_cli() {
    if ! command -v firebase &> /dev/null; then
        print_error "Firebase CLI nicht installiert!"
        echo "Installieren Sie Firebase CLI: npm install -g firebase-tools"
        exit 1
    fi
    print_success "Firebase CLI gefunden"
}

# Überprüfen ob User bei Firebase angemeldet ist
check_firebase_login() {
    if ! firebase projects:list &> /dev/null; then
        print_error "Nicht bei Firebase angemeldet!"
        echo "Bitte melden Sie sich an: firebase login"
        exit 1
    fi
    print_success "Firebase Anmeldung aktiv"
}

# Environment Variable aus .env lesen
get_env_var() {
    local var_name="$1"
    local value=$(grep "^${var_name}=" .env | cut -d '=' -f2- | sed 's/^"//' | sed 's/"$//')
    echo "$value"
}

# Environment Variable zu Firebase Functions Config hinzufügen
set_firebase_config() {
    local config_path="$1"
    local env_var="$2"
    local value="$3"
    
    if [ -n "$value" ] && [ "$value" != "your-"* ]; then
        firebase functions:config:set "${config_path}=${value}" > /dev/null 2>&1
        print_success "Gesetzt: $config_path"
    else
        print_warning "Übersprungen: $config_path (Wert nicht konfiguriert)"
    fi
}

# Hauptfunktionen
setup_openai_config() {
    print_step "OpenAI Konfiguration..."
    
    local api_key=$(get_env_var "OPENAI_API_KEY")
    local model=$(get_env_var "OPENAI_MODEL")
    local embedding_model=$(get_env_var "OPENAI_EMBEDDING_MODEL")
    local org_id=$(get_env_var "OPENAI_ORGANIZATION_ID")
    local max_tokens=$(get_env_var "OPENAI_MAX_TOKENS")
    local temperature=$(get_env_var "OPENAI_TEMPERATURE")
    
    set_firebase_config "openai.api_key" "OPENAI_API_KEY" "$api_key"
    set_firebase_config "openai.model" "OPENAI_MODEL" "$model"
    set_firebase_config "openai.embedding_model" "OPENAI_EMBEDDING_MODEL" "$embedding_model"
    set_firebase_config "openai.organization_id" "OPENAI_ORGANIZATION_ID" "$org_id"
    set_firebase_config "openai.max_tokens" "OPENAI_MAX_TOKENS" "$max_tokens"
    set_firebase_config "openai.temperature" "OPENAI_TEMPERATURE" "$temperature"
}

setup_pinecone_config() {
    print_step "Pinecone Konfiguration..."
    
    local api_key=$(get_env_var "PINECONE_API_KEY")
    local environment=$(get_env_var "PINECONE_ENVIRONMENT")
    local index_name=$(get_env_var "PINECONE_INDEX_NAME")
    
    set_firebase_config "pinecone.api_key" "PINECONE_API_KEY" "$api_key"
    set_firebase_config "pinecone.environment" "PINECONE_ENVIRONMENT" "$environment"
    set_firebase_config "pinecone.index_name" "PINECONE_INDEX_NAME" "$index_name"
}

setup_firebase_config() {
    print_step "Firebase Konfiguration..."
    
    local project_id=$(get_env_var "PROJECT_ID")
    local private_key=$(get_env_var "PRIVATE_KEY")
    local client_email=$(get_env_var "CLIENT_EMAIL")
    local storage_bucket=$(get_env_var "STORAGE_BUCKET")
    
    set_firebase_config "firebase.project_id" "PROJECT_ID" "$project_id"
    set_firebase_config "firebase.private_key" "PRIVATE_KEY" "$private_key"
    set_firebase_config "firebase.client_email" "CLIENT_EMAIL" "$client_email"
    set_firebase_config "firebase.storage_bucket" "STORAGE_BUCKET" "$storage_bucket"
}

setup_security_config() {
    print_step "Sicherheitskonfiguration..."
    
    local jwt_secret=$(get_env_var "JWT_SECRET")
    local encryption_key=$(get_env_var "ENCRYPTION_KEY")
    
    set_firebase_config "security.jwt_secret" "JWT_SECRET" "$jwt_secret"
    set_firebase_config "security.encryption_key" "ENCRYPTION_KEY" "$encryption_key"
}

setup_app_config() {
    print_step "Anwendungskonfiguration..."
    
    local node_env=$(get_env_var "NODE_ENV")
    local log_level=$(get_env_var "LOG_LEVEL")
    local api_version=$(get_env_var "API_VERSION")
    
    set_firebase_config "app.node_env" "NODE_ENV" "$node_env"
    set_firebase_config "app.log_level" "LOG_LEVEL" "$log_level"
    set_firebase_config "app.api_version" "API_VERSION" "$api_version"
}

setup_rate_limiting_config() {
    print_step "Rate Limiting Konfiguration..."
    
    local window_ms=$(get_env_var "RATE_LIMIT_WINDOW_MS")
    local max_requests=$(get_env_var "RATE_LIMIT_MAX_REQUESTS")
    local openai_rpm=$(get_env_var "OPENAI_RATE_LIMIT_RPM")
    local openai_tpm=$(get_env_var "OPENAI_RATE_LIMIT_TPM")
    
    set_firebase_config "rate_limit.window_ms" "RATE_LIMIT_WINDOW_MS" "$window_ms"
    set_firebase_config "rate_limit.max_requests" "RATE_LIMIT_MAX_REQUESTS" "$max_requests"
    set_firebase_config "rate_limit.openai_rpm" "OPENAI_RATE_LIMIT_RPM" "$openai_rpm"
    set_firebase_config "rate_limit.openai_tpm" "OPENAI_RATE_LIMIT_TPM" "$openai_tpm"
}

setup_monitoring_config() {
    print_step "Monitoring Konfiguration..."
    
    local sentry_dsn=$(get_env_var "SENTRY_DSN")
    local analytics_enabled=$(get_env_var "ANALYTICS_ENABLED")
    
    set_firebase_config "monitoring.sentry_dsn" "SENTRY_DSN" "$sentry_dsn"
    set_firebase_config "monitoring.analytics_enabled" "ANALYTICS_ENABLED" "$analytics_enabled"
}

# Validierung
validate_required_vars() {
    print_step "Validierung der erforderlichen Variablen..."
    
    local required_vars=(
        "OPENAI_API_KEY"
        "PINECONE_API_KEY"
        "PROJECT_ID"
        "JWT_SECRET"
        "ENCRYPTION_KEY"
    )
    
    local missing_vars=()
    
    for var in "${required_vars[@]}"; do
        local value=$(get_env_var "$var")
        if [ -z "$value" ] || [ "$value" = "your-"* ]; then
            missing_vars+=("$var")
        fi
    done
    
    if [ ${#missing_vars[@]} -gt 0 ]; then
        print_error "Folgende erforderliche Variablen sind nicht konfiguriert:"
        for var in "${missing_vars[@]}"; do
            echo "  - $var"
        done
        echo ""
        echo "Bitte konfigurieren Sie diese Variablen in der .env-Datei und führen Sie das Script erneut aus."
        exit 1
    fi
    
    print_success "Alle erforderlichen Variablen sind konfiguriert"
}

# Backup der aktuellen Konfiguration
backup_current_config() {
    print_step "Backup der aktuellen Firebase-Konfiguration..."
    
    firebase functions:config:get > firebase-config-backup-$(date +%Y%m%d_%H%M%S).json
    print_success "Backup erstellt"
}

# Konfigurations-Übersicht anzeigen
show_config_summary() {
    print_step "Konfiguration wird zu Firebase übertragen..."
    echo ""
    echo "Firebase Projekt: $(firebase use)"
    echo ""
    
    # Aktuelle Konfiguration anzeigen
    echo "Aktuelle Firebase Functions Konfiguration:"
    firebase functions:config:get
}

# Hauptscript
main() {
    echo ""
    print_step "Vorbereitungsprüfungen..."
    
    check_env_file
    check_firebase_cli
    check_firebase_login
    
    echo ""
    validate_required_vars
    
    echo ""
    print_step "Möchten Sie ein Backup der aktuellen Konfiguration erstellen? (y/n)"
    read -r backup_response
    if [[ "$backup_response" =~ ^[Yy]$ ]]; then
        backup_current_config
    fi
    
    echo ""
    print_step "Konfiguration wird übertragen..."
    echo ""
    
    setup_openai_config
    setup_pinecone_config
    setup_firebase_config
    setup_security_config
    setup_app_config
    setup_rate_limiting_config
    setup_monitoring_config
    
    echo ""
    print_success "🎉 Konfiguration erfolgreich übertragen!"
    echo ""
    
    show_config_summary
    
    echo ""
    print_step "Nächste Schritte:"
    echo "1. Führen Sie 'pnpm run build' aus, um TypeScript zu kompilieren"
    echo "2. Führen Sie 'firebase deploy --only functions' aus, um zu deployen"
    echo "3. Testen Sie die API-Endpoints nach dem Deployment"
    
    echo ""
    print_success "Setup abgeschlossen! 🚀"
}

# Script ausführen
main "$@"
