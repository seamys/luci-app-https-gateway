'use strict';
'require view';
'require uci';
'require rpc';
'require poll';
'require fs';

var callStatus    = rpc.declare({ object: 'https-gateway', method: 'status' });
var callNginxTest = rpc.declare({ object: 'https-gateway', method: 'nginx_test' });
var callCertIssue = rpc.declare({ object: 'https-gateway', method: 'cert_issue' });
var callCertStatus = rpc.declare({ object: 'https-gateway', method: 'cert_status' });

function badge(text, color) {
	return E('span', {
		'style': 'display:inline-block;padding:2px 10px;border-radius:10px;' +
		         'color:#fff;font-weight:bold;background:' + color
	}, text);
}

function formatLog(raw) {
	return (raw || '').replace(/\|/g, '\n').trim();
}

function renderCards(st) {
	st = st || {};
	var nginxColor = st.nginx_running ? '#2e7d32' : '#c62828';
	var nginxText  = st.nginx_running ? _('Running') : _('Stopped');

	return E('div', { 'style': 'display:flex;gap:1em;flex-wrap:wrap;margin-bottom:1em' }, [
		E('div', { 'style': 'flex:1;min-width:130px;padding:12px 16px;border-radius:6px;' +
		           'background:#f5f5f5;border-left:4px solid ' + nginxColor }, [
			E('div', { 'style': 'font-size:0.8em;color:#666;margin-bottom:4px' }, _('nginx')),
			E('div', { 'style': 'font-weight:bold;font-size:1.1em' }, nginxText)
		]),
		E('div', { 'style': 'flex:1;min-width:130px;padding:12px 16px;border-radius:6px;' +
		           'background:#f5f5f5;border-left:4px solid #1976d2' }, [
			E('div', { 'style': 'font-size:0.8em;color:#666;margin-bottom:4px' }, _('Certificates')),
			E('div', { 'style': 'font-weight:bold;font-size:1.1em' },
			  String((st.certificates || []).length))
		]),
		E('div', { 'style': 'flex:1;min-width:130px;padding:12px 16px;border-radius:6px;' +
		           'background:#f5f5f5;border-left:4px solid #6a1b9a' }, [
			E('div', { 'style': 'font-size:0.8em;color:#666;margin-bottom:4px' }, _('Proxy Rules')),
			E('div', { 'style': 'font-weight:bold;font-size:1.1em' }, String(st.proxy_count || 0))
		])
	]);
}

function renderCertTable(st) {
	st = st || {};
	var rows = [];

	if (st.certificates && st.certificates.length) {
		st.certificates.forEach(function(cert) {
			var statusBadge;
			if (cert.status === 'valid')
				statusBadge = badge(_('Valid'), '#2e7d32');
			else if (cert.status === 'pending')
				statusBadge = badge(_('Pending'), '#f57c00');
			else
				statusBadge = badge(cert.status || _('Unknown'), '#888');

			rows.push(E('tr', { 'class': 'tr' }, [
				E('td', { 'class': 'td' }, cert.domain || '\u2014'),
				E('td', { 'class': 'td' }, statusBadge),
				E('td', { 'class': 'td' }, cert.expires || '\u2014'),
				E('td', { 'class': 'td' }, cert.key_type || '\u2014')
			]));
		});
	} else {
		rows.push(E('tr', { 'class': 'tr' }, [
			E('td', { 'class': 'td', 'colspan': '4',
			          'style': 'text-align:center;color:#888;padding:1em' },
			  _('No certificates configured'))
		]));
	}

	return E('table', { 'class': 'table' }, [
		E('tr', { 'class': 'tr cbi-section-table-titles' }, [
			E('th', { 'class': 'th' }, _('Domain')),
			E('th', { 'class': 'th' }, _('Status')),
			E('th', { 'class': 'th' }, _('Expires')),
			E('th', { 'class': 'th' }, _('Key Type'))
		])
	].concat(rows));
}

function makeFeedback() {
	return E('div', { 'style': 'display:none;margin-top:0.5em;padding:8px 12px;' +
	                            'border-radius:4px;white-space:pre-wrap' }, '');
}

function showFeedback(el, text, type) {
	var colors = {
		info:    { bg: '#e3f2fd', border: '#1976d2', fg: '#0d47a1' },
		success: { bg: '#e8f5e9', border: '#2e7d32', fg: '#1b5e20' },
		warning: { bg: '#fff8e1', border: '#f9a825', fg: '#e65100' },
		error:   { bg: '#ffebee', border: '#c62828', fg: '#b71c1c' }
	};
	var c = colors[type] || colors.info;
	el.style.display    = '';
	el.style.background = c.bg;
	el.style.borderLeft = '4px solid ' + c.border;
	el.style.color      = c.fg;
	el.innerText        = text;
}

function hideFeedback(el) {
	el.style.display = 'none';
	el.innerText     = '';
}

return view.extend({
	load: function() {
		return Promise.all([
			uci.load('https_gateway'),
			callStatus().catch(function() { return {}; })
		]);
	},

	render: function(data) {
		var initialStatus = data[1] || {};
		var useStaging    = uci.get('https_gateway', 'global', 'use_staging');
		var noCerts       = !initialStatus.certificates || !initialStatus.certificates.length;

		/* ── Staging warning banner ───────────────────────── */
		var stagingBanner;
		if (useStaging === '1') {
			stagingBanner = E('div', {
				'style': 'margin-bottom:1em;padding:10px 16px;background:#fff8e1;' +
				         'border-left:4px solid #f9a825;border-radius:4px'
			}, [
				E('strong', {}, _('Staging Mode Active')),
				E('span', {}, ' \u2014 ' + _('Certificates are NOT trusted by browsers. Go to ')),
				E('a', { 'href': L.url('admin/services/https-gateway/settings') }, _('Settings')),
				E('span', {}, ' ' + _('and disable "Use Staging Environment" before issuing real certificates.'))
			]);
		} else {
			stagingBanner = E('div', { 'style': 'display:none' }, '');
		}

		/* ── Live-updating status containers ──────────────── */
		var cardsBox     = E('div', {}, renderCards(initialStatus));
		var certTableBox = E('div', {}, renderCertTable(initialStatus));

		poll.add(function() {
			return callStatus().then(function(st) {
				var fresh;
				fresh = renderCards(st);
				cardsBox.innerHTML = '';
				cardsBox.appendChild(fresh);
				fresh = renderCertTable(st);
				certTableBox.innerHTML = '';
				certTableBox.appendChild(fresh);
			});
		}, 5);

		/* ── Feedback panels ────────────────────────────── */
		var testFeedback   = makeFeedback();
		var issueFeedback  = makeFeedback();
		var reloadFeedback = makeFeedback();

		/* ── Test nginx Config ─────────────────────────── */
		var btnTest = E('button', {
			'class': 'btn cbi-button cbi-button-action',
			'click': function() {
				var self = this;
				self.disabled  = true;
				self.innerText = _('Testing...');
				hideFeedback(testFeedback);

				callNginxTest().then(function(res) {
					if (res && res.valid)
						showFeedback(testFeedback, _('nginx configuration test passed.'), 'success');
					else
						showFeedback(testFeedback,
							_('nginx configuration error: ') + (res && res.message || _('Unknown')),
							'error');
					self.disabled  = false;
					self.innerText = _('Test nginx Config');
				}, function(err) {
					showFeedback(testFeedback, _('nginx configuration error: ') + String(err), 'error');
					self.disabled  = false;
					self.innerText = _('Test nginx Config');
				});
			}
		}, _('Test nginx Config'));

		/* ── Issue / Renew Certificates ─────────────────── */
		var certPollFn = null;

		var btnIssue = E('button', {
			'class': 'btn cbi-button cbi-button-positive',
			'click': function() {
				var self = this;
				self.disabled  = true;
				self.innerText = _('Starting...');
				showFeedback(issueFeedback, _('Requesting certificate issuance...'), 'info');

				if (certPollFn) {
					poll.remove(certPollFn);
					certPollFn = null;
				}

				callCertIssue().then(function() {
					showFeedback(issueFeedback,
						_('Certificate issuance started. This may take 3-5 minutes...'), 'info');
					self.innerText = _('Issuing...');

					certPollFn = function() {
						return callCertStatus().then(function(st) {
							if (st.state === 'running') {
								showFeedback(issueFeedback,
									_('Issuing certificates...') + '\n' + formatLog(st.log),
									'info');
							} else {
								var ok = st.log && st.log.indexOf('success') !== -1;
								showFeedback(issueFeedback,
									_('Certificate issuance completed.') + '\n' + formatLog(st.log),
									ok ? 'success' : 'warning');
								poll.remove(certPollFn);
								certPollFn      = null;
								self.disabled   = false;
								self.innerText  = _('Issue/Renew Certificates');
							}
						});
					};
					poll.add(certPollFn, 5);

				}, function(err) {
					showFeedback(issueFeedback,
						_('Failed to start certificate issuance: ') + String(err), 'error');
					self.disabled  = false;
					self.innerText = _('Issue/Renew Certificates');
				});
			}
		}, _('Issue/Renew Certificates'));

		/* ── Reload Configuration ─────────────────────── */
		var btnReload = E('button', {
			'class': 'btn cbi-button cbi-button-apply',
			'click': function() {
				var self = this;
				self.disabled  = true;
				self.innerText = _('Reloading...');
				hideFeedback(reloadFeedback);

				fs.exec('/etc/init.d/https_gateway', ['reload']).then(function() {
					showFeedback(reloadFeedback, _('Configuration reloaded successfully.'), 'success');
					self.disabled  = false;
					self.innerText = _('Reload Configuration');
				}, function(err) {
					showFeedback(reloadFeedback, _('Reload failed: ') + String(err), 'error');
					self.disabled  = false;
					self.innerText = _('Reload Configuration');
				});
			}
		}, _('Reload Configuration'));

		/* ── First-use guide ───────────────────────────── */
		var guideEl;
		if (noCerts) {
			guideEl = E('div', {
				'style': 'margin-top:1em;padding:12px 16px;background:#e8f5e9;' +
				         'border-left:4px solid #2e7d32;border-radius:4px'
			}, [
				E('strong', {}, _('Getting Started')),
				E('ol', { 'style': 'margin:8px 0 0 16px;padding:0' }, [
					E('li', {}, [
						E('a', { 'href': L.url('admin/services/https-gateway/settings') },
						  _('Settings')),
						E('span', {}, ' \u2014 ' +
						  _('Configure ACME email, DNS provider, and credentials'))
					]),
					E('li', {}, [
						E('a', { 'href': L.url('admin/services/https-gateway/certificates') },
						  _('Certificates')),
						E('span', {}, ' \u2014 ' + _('Add the domains you want to secure'))
					]),
					E('li', {}, E('span', {},
					  _('Return here and click \u201cIssue/Renew Certificates\u201d'))),
					E('li', {}, [
						E('a', { 'href': L.url('admin/services/https-gateway/proxies') },
						  _('Proxy Rules')),
						E('span', {}, ' \u2014 ' + _('Map each domain to your local services'))
					])
				])
			]);
		} else {
			guideEl = E('div', { 'style': 'display:none' }, '');
		}

		/* ── Layout ─────────────────────────────────────── */
		return E('div', { 'class': 'cbi-map' }, [
			stagingBanner,
			E('h2', { 'style': 'margin-top:0' }, _('HTTPS Gateway \u2014 Dashboard')),
			E('div', { 'class': 'cbi-section' }, [
				E('h3', {}, _('Service Status')),
				cardsBox,
				E('h4', {}, _('Certificate Status')),
				certTableBox,
				guideEl
			]),
			E('div', { 'class': 'cbi-section' }, [
				E('h3', {}, _('Quick Actions')),
				E('div', { 'style': 'display:flex;gap:0.5em;flex-wrap:wrap' }, [
					btnTest, btnIssue, btnReload
				]),
				testFeedback,
				issueFeedback,
				reloadFeedback
			])
		]);
	},

	handleSaveApply: null,
	handleSave: null,
	handleReset: null
});
