#!/bin/bash

# Production Deployment Script for Help Desk System
# Usage: ./deploy.sh [environment]
# Environment: staging|production (default: staging)

set -e  # Exit on any error

# Configuration
ENVIRONMENT=${1:-staging}
PROJECT_DIR=$(pwd)
BACKEND_DIR="$PROJECT_DIR/backend"
FRONTEND_DIR="$PROJECT_DIR/frontend"
BACKUP_DIR="/backup/$(date +%Y%m%d_%H%M%S)"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Logging function
log() {
    echo -e "${BLUE}[$(date +'%Y-%m-%d %H:%M:%S')]${NC} $1"
}

error() {
    echo -e "${RED}[ERROR]${NC} $1" >&2
    exit 1
}

warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

# Check prerequisites
check_prerequisites() {
    log "Checking prerequisites..."
    
    # Check Node.js version
    if ! command -v node &> /dev/null; then
        error "Node.js is not installed"
    fi
    
    NODE_VERSION=$(node -v | cut -d'v' -f2)
    REQUIRED_VERSION="16.0.0"
    if [ "$(printf '%s\n' "$REQUIRED_VERSION" "$NODE_VERSION" | sort -V | head -n1)" != "$REQUIRED_VERSION" ]; then
        error "Node.js version $NODE_VERSION is too old. Required: $REQUIRED_VERSION+"
    fi
    
    # Check PM2
    if ! command -v pm2 &> /dev/null; then
        log "Installing PM2..."
        npm install -g pm2
    fi
    
    # Check MongoDB connection
    if ! command -v mongo &> /dev/null && ! command -v mongosh &> /dev/null; then
        warning "MongoDB client not found. Please ensure MongoDB is accessible."
    fi
    
    success "Prerequisites check completed"
}

# Create backup
create_backup() {
    log "Creating backup..."
    
    mkdir -p "$BACKUP_DIR"
    
    # Backup current deployment
    if [ -d "$FRONTEND_DIR/build" ]; then
        cp -r "$FRONTEND_DIR/build" "$BACKUP_DIR/frontend_build"
        log "Frontend build backed up"
    fi
    
    # Backup uploads
    if [ -d "$BACKEND_DIR/uploads" ]; then
        cp -r "$BACKEND_DIR/uploads" "$BACKUP_DIR/uploads"
        log "Uploads directory backed up"
    fi
    
    # Backup database (if MongoDB is local)
    if command -v mongodump &> /dev/null; then
        mongodump --db helpdesk --out "$BACKUP_DIR/mongodb" 2>/dev/null || warning "Database backup failed"
    fi
    
    success "Backup created at $BACKUP_DIR"
}

# Install dependencies
install_dependencies() {
    log "Installing dependencies..."
    
    # Backend dependencies
    cd "$BACKEND_DIR"
    if [ "$ENVIRONMENT" = "production" ]; then
        npm ci --only=production
    else
        npm ci
    fi
    
    # Frontend dependencies
    cd "$FRONTEND_DIR"
    npm ci
    
    cd "$PROJECT_DIR"
    success "Dependencies installed"
}

# Run security audit
security_audit() {
    log "Running security audit..."
    
    cd "$BACKEND_DIR"
    npm audit --audit-level=high || warning "Backend security issues found"
    
    cd "$FRONTEND_DIR"
    npm audit --audit-level=high || warning "Frontend security issues found"
    
    cd "$PROJECT_DIR"
    success "Security audit completed"
}

# Build frontend
build_frontend() {
    log "Building frontend for $ENVIRONMENT..."
    
    cd "$FRONTEND_DIR"
    
    if [ "$ENVIRONMENT" = "production" ]; then
        npm run build:prod
    else
        npm run build
    fi
    
    # Verify build
    if [ ! -d "build" ]; then
        error "Frontend build failed"
    fi
    
    cd "$PROJECT_DIR"
    success "Frontend built successfully"
}

# Deploy backend
deploy_backend() {
    log "Deploying backend..."
    
    cd "$BACKEND_DIR"
    
    # Stop existing PM2 processes
    pm2 stop helpdesk-backend 2>/dev/null || log "No existing PM2 process found"
    
    # Start with appropriate environment
    if [ "$ENVIRONMENT" = "production" ]; then
        npm run start:pm2:prod
    else
        npm run start:pm2
    fi
    
    # Wait for startup
    sleep 5
    
    # Verify deployment
    if ! pm2 list | grep -q "helpdesk-backend.*online"; then
        error "Backend deployment failed"
    fi
    
    cd "$PROJECT_DIR"
    success "Backend deployed successfully"
}

# Health check
health_check() {
    log "Performing health check..."
    
    # Wait for application to start
    sleep 10
    
    # Check health endpoint
    HEALTH_URL="http://localhost:5000/health"
    
    for i in {1..5}; do
        if curl -f -s "$HEALTH_URL" > /dev/null; then
            success "Health check passed"
            return 0
        fi
        log "Health check attempt $i/5 failed, retrying..."
        sleep 5
    done
    
    error "Health check failed after 5 attempts"
}

# Rollback function
rollback() {
    log "Rolling back deployment..."
    
    if [ -d "$BACKUP_DIR" ]; then
        # Restore frontend build
        if [ -d "$BACKUP_DIR/frontend_build" ]; then
            rm -rf "$FRONTEND_DIR/build"
            cp -r "$BACKUP_DIR/frontend_build" "$FRONTEND_DIR/build"
        fi
        
        # Restart backend with previous version
        pm2 restart helpdesk-backend
        
        success "Rollback completed"
    else
        error "No backup found for rollback"
    fi
}

# Cleanup old backups
cleanup_backups() {
    log "Cleaning up old backups..."
    
    # Keep only last 5 backups
    if [ -d "/backup" ]; then
        find /backup -maxdepth 1 -type d -name "20*" | sort -r | tail -n +6 | xargs rm -rf
        success "Old backups cleaned up"
    fi
}

# Main deployment function
main() {
    log "Starting deployment for environment: $ENVIRONMENT"
    
    # Trap errors for rollback
    trap 'error "Deployment failed. Run rollback if needed."' ERR
    
    check_prerequisites
    create_backup
    install_dependencies
    security_audit
    build_frontend
    deploy_backend
    health_check
    cleanup_backups
    
    success "Deployment completed successfully!"
    log "Application is running at:"
    log "  - Frontend: http://localhost:3000 (development) or configured domain"
    log "  - Backend API: http://localhost:5000/api"
    log "  - Health Check: http://localhost:5000/health"
    log ""
    log "PM2 Commands:"
    log "  - Status: pm2 status"
    log "  - Logs: pm2 logs helpdesk-backend"
    log "  - Restart: pm2 restart helpdesk-backend"
    log "  - Stop: pm2 stop helpdesk-backend"
}

# Handle script arguments
case "${1:-}" in
    "rollback")
        rollback
        ;;
    "staging"|"production"|"")
        main
        ;;
    *)
        echo "Usage: $0 [staging|production|rollback]"
        echo ""
        echo "Commands:"
        echo "  staging     - Deploy to staging environment (default)"
        echo "  production  - Deploy to production environment"
        echo "  rollback    - Rollback to previous deployment"
        exit 1
        ;;
esac