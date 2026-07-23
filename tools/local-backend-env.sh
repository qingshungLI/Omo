#!/usr/bin/env bash

set -euo pipefail

script_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
project_root="$(cd -- "${script_dir}/.." && pwd)"
backend_dir="${project_root}/backend"
runtime_dir="${project_root}/.runtime"
postgres_data_dir="${runtime_dir}/postgres-data"
postgres_log="${runtime_dir}/postgres.log"
postgres_port="55432"
postgres_database="recallo_dev"
postgres_host="127.0.0.1"

require_command() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "Missing required command: $1" >&2
    exit 1
  fi
}

postgres_is_running() {
  pg_ctl -D "${postgres_data_dir}" status >/dev/null 2>&1
}

initialize_postgres() {
  require_command initdb
  require_command pg_ctl
  require_command psql
  require_command createdb

  mkdir -p "${runtime_dir}"
  if [ ! -f "${postgres_data_dir}/PG_VERSION" ]; then
    echo "Initializing project-local PostgreSQL data directory..."
    initdb \
      -D "${postgres_data_dir}" \
      --encoding=UTF8 \
      --locale=C \
      --auth-local=trust \
      --auth-host=trust
  fi
}

start_postgres() {
  initialize_postgres

  if postgres_is_running; then
    echo "PostgreSQL is already running on ${postgres_host}:${postgres_port}."
  else
    echo "Starting project-local PostgreSQL..."
    pg_ctl \
      -D "${postgres_data_dir}" \
      -l "${postgres_log}" \
      -o "-p ${postgres_port} -h ${postgres_host}" \
      start
  fi

  if ! psql \
    -h "${postgres_host}" \
    -p "${postgres_port}" \
    -d postgres \
    -tAc "SELECT 1 FROM pg_database WHERE datname = '${postgres_database}'" \
    | grep -q 1; then
    createdb \
      -h "${postgres_host}" \
      -p "${postgres_port}" \
      "${postgres_database}"
    echo "Created database ${postgres_database}."
  fi
}

stop_postgres() {
  if [ ! -f "${postgres_data_dir}/PG_VERSION" ]; then
    echo "Project-local PostgreSQL has not been initialized."
    return
  fi

  if postgres_is_running; then
    pg_ctl -D "${postgres_data_dir}" stop
  else
    echo "Project-local PostgreSQL is already stopped."
  fi
}

show_status() {
  if [ -f "${postgres_data_dir}/PG_VERSION" ] && postgres_is_running; then
    pg_isready -h "${postgres_host}" -p "${postgres_port}"
  else
    echo "PostgreSQL is not running."
    return 1
  fi
}

install_dependencies() {
  require_command node
  require_command npm
  echo "Installing lockfile-pinned backend dependencies..."
  npm --prefix "${backend_dir}" ci
}

run_doctor() {
  local failed="0"

  for command_name in node npm initdb pg_ctl psql createdb ffmpeg; do
    if command -v "${command_name}" >/dev/null 2>&1; then
      echo "ok  ${command_name}: $(command -v "${command_name}")"
    else
      echo "missing  ${command_name}"
      failed="1"
    fi
  done

  if [ -d "${backend_dir}/node_modules/pg" ] && [ -d "${backend_dir}/node_modules/playwright" ]; then
    echo "ok  backend dependencies"
  else
    echo "missing  backend dependencies; run npm run setup:local"
    failed="1"
  fi

  if [ -f "${backend_dir}/.env" ]; then
    echo "ok  backend/.env"
  else
    echo "missing  backend/.env; copy backend/.env.example and keep secrets local"
    failed="1"
  fi

  if [ -f "${postgres_data_dir}/PG_VERSION" ] && postgres_is_running; then
    echo "ok  PostgreSQL ${postgres_host}:${postgres_port}"
  else
    echo "stopped  project-local PostgreSQL"
  fi

  if [ "${failed}" = "1" ]; then
    return 1
  fi
}

case "${1:-doctor}" in
  setup)
    install_dependencies
    start_postgres
    run_doctor
    ;;
  dev)
    start_postgres
    exec npm --prefix "${backend_dir}" run dev
    ;;
  start)
    start_postgres
    ;;
  stop)
    stop_postgres
    ;;
  status)
    show_status
    ;;
  doctor)
    run_doctor
    ;;
  *)
    echo "Usage: $0 {setup|dev|start|stop|status|doctor}" >&2
    exit 2
    ;;
esac

