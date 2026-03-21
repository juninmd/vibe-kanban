import re

with open('src/app.ts', 'r') as f:
    content = f.read()

secure_random_fn = """
function secureRandom(): number {
  return crypto.getRandomValues(new Uint32Array(1))[0] / (0xffffffff + 1);
}

"""

if "function secureRandom()" not in content:
    content = secure_random_fn + content

content = content.replace("Math.random()", "secureRandom()")

with open('src/app.ts', 'w') as f:
    f.write(content)

with open('src/server.ts', 'r') as f:
    content_server = f.read()

content_server = content_server.replace("Math.random().toString(36).substr(2, 9)", "crypto.randomUUID().split('-')[0]")

with open('src/server.ts', 'w') as f:
    f.write(content_server)
