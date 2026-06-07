COMPOSE = docker compose -f infra/docker-compose.yml

.PHONY: up down logs ps health reset-local

## up: start all infrastructure services in the background
up:
	$(COMPOSE) up -d

## down: stop all infrastructure services (preserves volumes)
down:
	$(COMPOSE) down

## logs: follow logs from all running containers
logs:
	$(COMPOSE) logs -f

## ps: show running container status
ps:
	$(COMPOSE) ps

## health: check connectivity to all infra dependencies
health:
	@sh scripts/infra-health.sh

## reset-local: destroy local volumes (pass CONFIRM=yes to skip prompt)
reset-local:
	@sh scripts/reset-local.sh --confirm
