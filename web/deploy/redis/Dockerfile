FROM redis:7-alpine
# Password comes from the Fly secret REDIS_PASSWORD (exposed as env in the machine).
CMD ["sh","-c","exec redis-server --requirepass \"$REDIS_PASSWORD\" --maxmemory 200mb --maxmemory-policy allkeys-lru --appendonly no --save ''"]
