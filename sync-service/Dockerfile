FROM mcr.microsoft.com/playwright:v1.55.0-noble
WORKDIR /app
COPY package.json ./
RUN npm install --omit=dev
COPY server.mjs ./
COPY palms-report.mjs ./
ENV PORT=10000
CMD ["npm","start"]
