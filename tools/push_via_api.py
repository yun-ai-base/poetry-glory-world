# -*- coding: utf-8 -*-
"""
通过 GitHub Git Data API 推送本地提交（git 协议被网络封锁时，仅 api.github.com 可达）

用法:
    python tools/push_via_api.py [commit_sha]

- commit_sha 缺省为 HEAD
- 将指定提交相对其父提交的变更，重建在【远端当前 head】之上（rebase 语义）
- 警告：若远端 head 与本地提交的父提交分叉，需先人工确认工作区文件已
  包含远端最新内容（本脚本直接用本地工作区文件生成 blob）
"""
import base64, json, os, re, subprocess, sys, urllib.request, urllib.error

PROJ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))  # 项目根目录
OWNER, REPO = "yun-ai-base", "poetry-glory-world"
API = "https://api.github.com"

# ---------- token（从 git store 凭据读取，不硬编码） ----------
cred = open(os.path.expanduser("~/.git-credentials"), encoding="utf-8").read()
m = re.search(r"https://%s:([^@]+)@github\.com" % OWNER, cred)
if not m:
    print("ERROR: 未找到 %s 的 token" % OWNER); sys.exit(1)
TOKEN = m.group(1)

def api(method, url, body=None):
    req = urllib.request.Request(url, method=method,
        headers={"Authorization": "token " + TOKEN, "Accept": "application/vnd.github+json",
                 "Content-Type": "application/json"})
    data = json.dumps(body).encode() if body is not None else None
    try:
        with urllib.request.urlopen(req, data=data) as r:
            return json.loads(r.read().decode())
    except urllib.error.HTTPError as e:
        print("HTTP %s %s -> %s" % (method, url.split('github.com')[-1][:70], e.code))
        print(e.read().decode()[:300])
        raise

def git(*args):
    return subprocess.run(["git", "-C", PROJ] + list(args), capture_output=True, text=True, encoding="utf-8").stdout

# ---------- 0. 目标提交 ----------
COMMIT = sys.argv[1] if len(sys.argv) > 1 else "HEAD"
PARENT = git("log", "-1", "--format=%P", COMMIT).strip()
print("目标提交:", COMMIT, "| 父提交:", PARENT[:8] if PARENT else "(根提交)")

# ---------- 1. 远端 ref ----------
ref = api("GET", "%s/repos/%s/%s/git/ref/heads/master" % (API, OWNER, REPO))
BASE_SHA = ref["object"]["sha"]
print("远端 base:", BASE_SHA[:8])
if BASE_SHA != PARENT:
    print("⚠️ 远端 head 与本地提交的父提交不一致（历史分叉）。")
    print("   若本地工作区文件已合并远端最新内容（如手动合并过），可继续；否则请先核对。")

# ---------- 2. base commit 的 tree ----------
base_commit = api("GET", "%s/repos/%s/%s/git/commits/%s" % (API, OWNER, REPO, BASE_SHA))
BASE_TREE = base_commit["tree"]["sha"]

# ---------- 3. 提交元数据与文件列表 ----------
MESSAGE = git("log", "-1", "--format=%B", COMMIT).rstrip("\n")
ANAME, AEMAIL = git("log", "-1", "--format=%an", COMMIT).strip(), git("log", "-1", "--format=%ae", COMMIT).strip()
ADATE, CDATE = git("log", "-1", "--format=%aI", COMMIT).strip(), git("log", "-1", "--format=%cI", COMMIT).strip()
FILES = git("diff-tree", "--no-commit-id", "--name-only", "-r", COMMIT).splitlines()
FILES = [f for f in FILES if f]  # 过滤空行
print("变更文件 (%d):" % len(FILES), FILES)

# ---------- 4. blobs ----------
tree_entries = []
for f in FILES:
    with open(os.path.join(PROJ, f), "rb") as fh:
        content = fh.read()
    blob = api("POST", "%s/repos/%s/%s/git/blobs" % (API, OWNER, REPO),
               {"content": base64.b64encode(content).decode(), "encoding": "base64"})
    tree_entries.append({"path": f, "mode": "100644", "type": "blob", "sha": blob["sha"]})
    print("blob:", f, blob["sha"][:8], len(content), "bytes")

# ---------- 5. tree ----------
new_tree = api("POST", "%s/repos/%s/%s/git/trees" % (API, OWNER, REPO),
               {"base_tree": BASE_TREE, "tree": tree_entries})

# ---------- 6. commit（parent = 远端 head，形成线性历史） ----------
commit = api("POST", "%s/repos/%s/%s/git/commits" % (API, OWNER, REPO), {
    "message": MESSAGE, "tree": new_tree["sha"], "parents": [BASE_SHA],
    "author": {"name": ANAME, "email": AEMAIL, "date": ADATE},
    "committer": {"name": ANAME, "email": AEMAIL, "date": CDATE}})
NEW_SHA = commit["sha"]
print("new commit:", NEW_SHA)

# ---------- 7. 更新 ref（非 force） ----------
api("PATCH", "%s/repos/%s/%s/git/refs/heads/master" % (API, OWNER, REPO),
    {"sha": NEW_SHA, "force": False})

# ---------- 8. 验证 ----------
ref2 = api("GET", "%s/repos/%s/%s/git/ref/heads/master" % (API, OWNER, REPO))
ok = ref2["object"]["sha"] == NEW_SHA
print("验证: 远端 head =", ref2["object"]["sha"][:8], "匹配:", ok)
print("OK 推送完成" if ok else "!! 推送未生效，请检查")
