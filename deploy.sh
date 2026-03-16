#!/bin/bash

# CharlieTourGuide Automated Deployment Script
# This script automates the deployment of the stateless Node.js backend
# and React frontend to Google Cloud Run.

set -e # Exit immediately if a command exits with a non-zero status.

PROJECT_ID="project-09e07c33-477c-419a-b58"
REGION="us-central1"
SERVICE_NAME="charlie"

echo "======================================================"
echo "🚀 Starting Automated Deployment for CharlieTourGuide..."
echo "Project ID: $PROJECT_ID"
echo "Region:     $REGION"
echo "Service:    $SERVICE_NAME"
echo "======================================================"

# Ensure gcloud is authenticated and project is set
echo "🔍 Verifying Google Cloud configuration..."
gcloud config set project $PROJECT_ID

# Deploy the service from source. 
# Cloud Run will automatically build the container via Cloud Build 
# using the Dockerfile in the current directory and deploy it.
echo "📦 Building container and deploying to Google Cloud Run..."
gcloud run deploy $SERVICE_NAME \
  --source . \
  --region $REGION \
  --project $PROJECT_ID \
  --allow-unauthenticated \
  --quiet

echo "✅ Automated deployment complete!"
echo "Your service is live. Check the GCP Console for metrics."
