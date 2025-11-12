
# Tabtin

  

A self-hostable, mobile-first web app to create tables from images. It's 2025, so of course this uses AI to help you create things like inventory lists and more!

  

## Table of Contents

  

1. [Overview](#overview)

2. [Prerequisites](#prerequisites)

3. [Installation](#installation)
   
5. [Getting Started](#getting-started)

5. [AI Model Options](#ai-model-options)

- 5.1 [Google AI Studio (Free Tier)](#google-ai-studio-free-tier)

- 5.2 [OpenRouter (Paid/Free Tier)](#openrouter-paidfree-tier)

- 5.3 [Local AI Models](#local-ai-models)

6. [Development Setup](#development-setup)

7. [Troubleshooting](#troubleshooting)


  

## 1. Overview

  

Tabtin is an image processing platform that enables users to:

  

- Define the data structure you want to extract from images (essentially create the first row of your future spreadsheet)

- Select the vision model for data extraction (Google, OpenRouter, or local models via OpenAI-compatible endpoints)

- Review extracted data in an intuitive interface (because who fully trusts AI?)

- Export your data as CSV

  

The app handles the heavy lifting by sending batched images (e.g., front and back views of an object) to vision LLMs and extracting user-defined data. It includes review and redo methods to ensure you only capture the right data. Everything is customizable: prompts, field descriptions, context for the LLM, and your choice of model.

  

## 2. Prerequisites

  

Before starting, ensure you have:

  

-  **Docker & Docker Compose** (for containerized deployment)

-  **Git** (to clone the repository)

-  **A Vision LLM** (for example):

- Google AI Studio API (free tier available)

- OpenRouter API (free tier with 10€ credit)

- Local LLM setup
  

See the [AI Model Options](#ai-model-options) section below for details on obtaining API keys and setting up models.

  

## 3. Installation

  

### 3.1 Clone the Repository

  

```bash

git  clone  https://github.com/YOUR_USERNAME/tabtin.git

cd  tabtin

```

  

### 3.2 Configure Environment

  

Copy the example environment file:

  

```bash

cp  .env.example  .env

```

  

Edit `.env` and configure the following:

  

```env

POCKETBASE_ADMIN_EMAIL=admin@example.com

POCKETBASE_ADMIN_PASSWORD=your-secure-admin-password

```

  

**Note:** These credentials secure your database backend. They are not used for user login.

  

### 3.3 Start with Docker

  

Start the application:

  

```bash

docker  compose  up  --build  -d

```

  

The first startup might take a couple of minutes. You can check the docker logs to ensure everything works as expected.

  

**Access Points:**

  

-  **Frontend:** http://YOUR-MACHINE-IP

-  **PocketBase Admin:** http://YOUR-MACHINE-IP:8090/_/ (database access - rarely needed)

  

## 4. Getting Started

  

### 4.1 Creating Your First Project

  

Each project results in a table. For example, imagine creating an inventory list of containers in your garage. This will be a project, where you will take images of each container in your garage.

  

1.  **Register & Login**

- Navigate to the register page and create your first account

- Login to access the dashboard

  

2.  **Create a Project**

- Create a new project from the dashboard

- Navigate to your project settings

  

3.  **Configure Model**

- Choose the model you want to use (Google, OpenRouter, or OpenAI-compatible endpoint for local models)

- For cloud models with free tiers, set the max requests per minute to stay within rate limits

  

4.  **Define Table Structure**

- Set up your table structure (column names)

- Add explanations for how you expect each field to look

- This helps guide the AI in extracting the right data

  

5.  **Start Processing**

- Save your project settings

- Begin taking or uploading images for processing

  

## 5. AI Model Options

  

Tabtin supports multiple vision models. You should definitely experiment to find models suitable for your use case and individual prompts.

  

**Performance Characteristics:**

-  Smarter models: Take more time per image but can extract more "abstract" data.

-  Smaller models: Faster but may struggle with complex tasks. They excel at extracting specific text or numbers present on images (e.g., cataloging containers)

  

**Disclaimer:** Currently, only Qwen3 model output produces reliable bounding boxes. Gemini output has been challenging to convert to proper bounding boxes, though Gemini's extraction accuracy is excellent. If id have to accept unreviewed data, id probably go with gemini anytime.

  

### 5.1 Google AI Studio (Free Tier)

  

Google offers free access to their AI models through AI Studio with generous rate limits.

  

for example

-  **gemini-2.5-flash-lite:** Up to 1,500 requests per day

-  **gemini-2.5-flash:** 50-250 requests per day (still plenty for most use cases)

  

**Get Your API Key:**

- Visit: https://aistudio.google.com/api-keys

  

### 5.2 OpenRouter (Paid/Free Tier)

  

OpenRouter offers a unique free tier where you can use several models at no cost as long as you maintain a 10€ balance in your account.

  

**How it Works:**

- Deposit 10€

- Access multiple models from their free tier

- Experiment with different models to find what works best

  

**Get Your API Key:**

- Visit: https://openrouter.ai

  

### 5.3 Local AI Models

  

For local vision LLMs, the **Qwen3 series** with **llama.cpp** is strongly recommended.

  

**Important Notes:**

- All testing has been done with Qwen models

- Qwen3 is currently the only model that works with 100% of this application's functions

- Other models, particularly for bounding box generation, have not been fully tested

  

**Setup:**

- Configure your local endpoint as an OpenAI-compatible API

- Be sure to add **/v1/chat/completions**  endpoint!

  

## 6. Development Setup

  

### 6.1 Local Development

  

Install dependencies:

  

```bash

npm  install

```

  

Update `.env` for local development:

  

```env

POCKETBASE_URL=http://127.0.0.1:8090

```

  

### 6.2 Running Development Servers

  

Open two terminal windows:

  

**Terminal 1 - Backend:**

  

```bash

npm  run  backend

```

  

Backend runs at `http://localhost:8090`

  

**Terminal 2 - Frontend:**

  

```bash

npm  run  dev

```

  

Frontend runs at `http://localhost:5173`

  

Both services are accessible from any device on your network, making it easy to test on mobile devices.

  

## 7. Troubleshooting

  

### 7.1 Poor Extraction Results

  

-  **Try a different model:** Smarter models often perform better

-  **Improve your prompt:** Add more specific context

-  **Image quality:** Ensure images are clear and well-lit

-  **Field descriptions:** Add detailed descriptions to guide the extraction

  

### 7.2 Bounding Boxes Not Working

  

Currently, only Qwen3-VL bounding boxes work reliably. Other models are not fully supported for this feature.

  

### 7.3 Rate Limiting Issues

  

If you're hitting rate limits with cloud providers:

- Reduce the max requests per minute in project settings
