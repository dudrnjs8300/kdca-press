fetch('/api/session').then(r=>r.ok?r.json():null).then(session=>{
  if(!session)return;
  document.querySelector('#auth-area').hidden=false;
  document.querySelector('#mcp-url').textContent=session.mcpUrl;
  document.querySelector('#session-note').textContent=session.user?`${session.user.login} 계정으로 연결을 준비했습니다. AI의 MCP 설정에 위 주소를 등록하세요.`:'MCP 연결을 사용할 때만 로그인이 필요합니다.';
  const demo=document.querySelector('#demo');
  if(session.demo){demo.hidden=false;demo.onclick=async()=>{const r=await fetch('/auth/demo',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'});if(r.ok)location.reload();};}
}).catch(()=>{});
