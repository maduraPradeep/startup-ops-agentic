COMPOSE_DIR := infrastructure/docker
COMPOSE     := docker compose -f $(COMPOSE_DIR)/docker-compose.dev.yml

.PHONY: dev-up dev-down dev-logs dev-reset dev-seed

dev-up:
	$(COMPOSE) up -d

dev-down:
	$(COMPOSE) down

dev-logs:
	$(COMPOSE) logs -f

dev-reset:
	$(COMPOSE) down -v
	$(COMPOSE) up -d

dev-seed:
	POSTGRES_CONTAINER=docker-postgres-1 \
	DIRECTUS_URL=http://localhost:8055 DIRECTUS_ADMIN_TOKEN=dev-admin-token \
	infrastructure/directus/setup-collections.sh
