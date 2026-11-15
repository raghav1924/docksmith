# Bloated Golang single-stage container
# Anti-patterns: compiles and runs in the same stage, massive final image size
FROM golang:latest

WORKDIR /workspace

ADD https://github.com/example/repo/archive/v1.0.tar.gz /tmp/

COPY go.mod go.sum ./
RUN go mod download

COPY . .
RUN go build -o /bin/server ./cmd/server

# Lingering build toolchains, Go compiler, and source code in production image
EXPOSE 8080
ENTRYPOINT ["/bin/server"]
