# Use Node.js 20
FROM node:20-alpine

# Set working directory
WORKDIR /app

# Copy package management files
COPY package*.json ./

# Install ALL dependencies (including devDependencies needed for build)
RUN npm install

# Copy the rest of the application files
COPY . .

# Build the frontend (creates /app/dist)
RUN npm run build

# Expose the dashboard port
EXPOSE 3000

# Set production environment
ENV NODE_ENV=production

# Run the server
CMD ["npm", "start"]