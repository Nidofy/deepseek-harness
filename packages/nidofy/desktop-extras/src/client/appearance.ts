/** Wallpaper asset, inset and opacity match the Tauri edition. */
export const wallpaperCss = `
[data-phase]:is([data-phase="blank"],[data-phase="hero"],[data-phase="settling"],[data-phase="active"]){isolation:isolate}
[data-phase]:is([data-phase="blank"],[data-phase="hero"],[data-phase="settling"],[data-phase="active"])::before{content:"";position:absolute;inset:24px;z-index:-1;pointer-events:none;background:url("/api/nidofy-extras/assets/theme/wallpaper.png") center/contain no-repeat;opacity:.14}
@media(forced-colors:active){[data-phase]::before{display:none}}
`
/** The center container already excludes both official sidebars. */
export const appearanceCss = `
.nidofy-dock{display:none;box-sizing:border-box;flex:0 0 300px;width:300px;min-height:0;padding:16px 14px 14px 10px;gap:12px;flex-direction:column;overflow:auto;color:var(--dsw-alias-label-primary);font:13px var(--dsw-font-family);border-left:1px solid var(--dsw-alias-border-l2)}
@container shell-center (min-width:1040px){.nidofy-dock{display:flex}}
.nidofy-dock *{box-sizing:border-box}
.nidofy-dock button{font:inherit;color:inherit;cursor:pointer;border:0;background:transparent;border-radius:8px;min-width:0}
.nidofy-dock button:hover{background:var(--dsw-alias-bg-layer-1)}
.nidofy-dock button:focus-visible{outline:2px solid var(--dsw-alias-label-primary);outline-offset:2px}
.nidofy-dock svg{flex-shrink:0;opacity:.75}
.nidofy-environment{flex:none;padding:10px;background:var(--dsw-alias-bg-layer-2);border:1px solid var(--dsw-alias-border-l2);border-radius:18px;box-shadow:0 3px 14px #00000008}
.nidofy-collapse{display:flex;gap:10px;align-items:center;width:100%;text-align:start;padding:8px}
.nidofy-collapse>span:first-of-type{flex:1;font-weight:600}
.nidofy-workspace{margin:12px 8px 6px;font-weight:600;overflow-wrap:anywhere}
.nidofy-row{display:flex;align-items:center;gap:10px;text-align:start;width:100%;padding:10px 8px}
.nidofy-row>span:first-of-type{flex:1;overflow:hidden;white-space:nowrap;text-overflow:ellipsis}
.nidofy-row small{font-size:12px;white-space:nowrap}
.nidofy-added{color:#20965a}.nidofy-deleted{color:#db5858}
.nidofy-path{font-size:11px;line-height:1.5;opacity:.65;overflow-wrap:anywhere;margin:6px 8px 12px;max-height:66px;overflow:auto}
.nidofy-environment-footer{display:flex;justify-content:space-between;border-top:1px solid var(--dsw-alias-border-l2);padding-top:8px;margin-top:8px}
.nidofy-environment-footer button{display:flex;align-items:center;gap:10px;padding:8px}
.nidofy-error{font-size:12px;margin:8px;overflow-wrap:anywhere}
.nidofy-companion{display:flex;flex:1;min-height:300px;flex-direction:column;border-radius:18px;background:linear-gradient(155deg,#829de514,transparent 65%);overflow:hidden}
.nidofy-character{position:relative;flex:1;min-height:150px;margin:4px 8px;overflow:hidden}
.nidofy-character img{position:absolute;inset:0;width:100%;height:100%;object-fit:contain;object-position:center bottom;user-select:none}
.nidofy-character canvas{width:100%;height:100%;display:block}
.nidofy-companion-caption{padding:12px 14px;border-top:1px solid var(--dsw-alias-border-l2)}
.nidofy-companion-caption p{font-size:12px;opacity:.65;margin:6px 0 0;line-height:1.5}
.nidofy-companion nav{display:grid;grid-template-columns:1fr 1fr;gap:6px;padding:0 8px 8px}
.nidofy-companion nav button{display:flex;align-items:center;gap:8px;text-align:start;padding:10px 8px;background:var(--dsw-alias-bg-layer-2);border:1px solid var(--dsw-alias-border-l2);font-size:12px}

.nidofy-dock button:disabled{cursor:default;opacity:.45}
.nidofy-change-row{display:flex;align-items:center;min-width:0}.nidofy-change-row>.nidofy-row{flex:1;min-width:0}.nidofy-more{flex:none;padding:10px 6px}
.nidofy-action-menu{display:grid;grid-template-columns:1fr 1fr;padding:6px;gap:4px;background:var(--dsw-alias-bg-layer-1);border-radius:10px}.nidofy-action-menu button{text-align:start;padding:8px}
.nidofy-detail{margin-top:10px;border-top:1px solid var(--dsw-alias-border-l2);padding:10px 4px;overflow-wrap:anywhere;min-width:0}
.nidofy-detail>header{display:flex;align-items:center;justify-content:space-between;gap:8px}.nidofy-detail>header button{padding:6px 10px}
.nidofy-detail p{font-size:12px;line-height:1.5}.nidofy-detail dl{font-size:12px;line-height:1.5}.nidofy-detail dt{opacity:.65;margin-top:10px}.nidofy-detail dd{margin:2px 0}
.nidofy-detail form,.nidofy-detail label{display:flex;flex-direction:column;gap:8px}.nidofy-detail label{margin:10px 0}
.nidofy-detail :is(input,select,textarea){width:100%;min-width:0;font:inherit;color:inherit;background:var(--dsw-alias-bg-layer-2);border:1px solid var(--dsw-alias-border-l2);border-radius:6px;padding:8px}.nidofy-detail textarea{resize:vertical;min-height:72px}
.nidofy-detail small{opacity:.7;font-size:11px;line-height:1.5}.nidofy-detail form button,.nidofy-inline-actions button{padding:8px;border:1px solid var(--dsw-alias-border-l2)}
.nidofy-inline-actions{display:flex;flex-wrap:wrap;gap:6px}.nidofy-full-workbench{margin-top:12px;padding:8px;font-size:12px!important;text-align:start}
.nidofy-change-list{max-height:220px;overflow:auto;margin:8px 0}.nidofy-change-list button{display:flex;gap:8px;width:100%;padding:7px 4px;text-align:start}.nidofy-change-list code{flex:none}.nidofy-change-list span{overflow-wrap:anywhere;min-width:0}
.nidofy-explorer [aria-pressed="true"],.nidofy-row[aria-expanded="true"]{background:var(--dsw-alias-bg-layer-1)}
.nidofy-detail pre{max-width:100%;max-height:260px;overflow:auto;font-size:11px;padding:8px;background:var(--dsw-alias-bg-layer-1);border-radius:8px;white-space:pre}
.nidofy-detail .nidofy-note-pin{flex-direction:row;align-items:center}.nidofy-detail .nidofy-note-pin input{width:auto;flex:none}.nidofy-notebook{max-height:65vh;overflow:auto;padding-right:8px}
.nidofy-operation-preview{padding:8px;border:1px solid var(--dsw-alias-border-l2);border-radius:8px}.nidofy-operation-preview button{margin:8px 4px 0 0}
`
