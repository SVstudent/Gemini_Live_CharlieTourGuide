FROM node:20-alpine

# Create app directory
WORKDIR /app

# Install app dependencies
COPY package*.json ./
RUN npm install

# Bundle app source
COPY . .

# Build the frontend application
RUN npm run build

# Set environment variables
ENV NODE_ENV=production
ENV PORT=8080

EXPOSE 8080

# Start the server using tsx
CMD [ "npx", "tsx", "server.ts" ]
