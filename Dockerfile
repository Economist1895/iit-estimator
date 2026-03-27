FROM gdssingapore/airbase:nginx-1.28

COPY --chown=app:app index.html /usr/share/nginx/html/
COPY --chown=app:app app.js /usr/share/nginx/html/
COPY --chown=app:app logo.png /usr/share/nginx/html/
