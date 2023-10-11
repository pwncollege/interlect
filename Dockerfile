FROM python:3.10

RUN pip install --upgrade pip && \
    pip install flask openai pyyaml

COPY ./server /server
COPY ./utils /utils

CMD ["flask", "run"]
