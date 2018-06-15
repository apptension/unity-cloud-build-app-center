FROM unit9/base

MAINTAINER Krzysztof Skoracki <krzysztof.skoracki@unit9.com>

RUN curl https://deb.nodesource.com/setup_10.x --output /tmp/node_setup && \
    bash /tmp/node_setup && \
    rm /tmp/node_setup && \
    apt install nodejs

WORKDIR /app

RUN adduser --system --no-create-home --disabled-login --group app
ADD config/run /etc/service/backend/run

ADD node_modules /app/node_modules
ADD index.html index.js /app/
