# syntax=docker/dockerfile:1
# The API image: build the server with the Go toolchain, run it alone on distroless static as a non-root user.
ARG GO_VERSION=1.27.3

FROM golang:${GO_VERSION}-trixie AS build
WORKDIR /src
COPY go.mod ./
COPY . .
RUN CGO_ENABLED=0 go build -trimpath -o /out/server ./cmd/server

# distroless/static ships /usr/share/zoneinfo, which time.LoadLocation reads for the schedule zones.
FROM gcr.io/distroless/static-debian13:nonroot
COPY --from=build /out/server /app/server
ENV HOST=0.0.0.0 PORT=8080
EXPOSE 8080
USER nonroot:nonroot
ENTRYPOINT ["/app/server"]
