import { useState, useEffect } from "react";
import { FileText, Upload, X } from "lucide-react";

export default function PdfViewer() {
	const [pdfUrl, setPdfUrl] = useState(null);

	useEffect(() => {
		// Revoke object URL on unmount to prevent memory leaks
		return () => {
			if (pdfUrl) URL.revokeObjectURL(pdfUrl);
		};
	}, [pdfUrl]);

	const handleFileUpload = (event) => {
		const file = event.target.files?.[0];
		if (file && file.type === "application/pdf") {
			if (pdfUrl) URL.revokeObjectURL(pdfUrl);
			setPdfUrl(URL.createObjectURL(file));
		}
	};

	const closeFile = () => {
		if (pdfUrl) URL.revokeObjectURL(pdfUrl);
		setPdfUrl(null);
	};

	return (
		<div className="pdf-viewer-app">
			<div className="browser-toolbar">
				<div
					style={{
						display: "flex",
						alignItems: "center",
						gap: "8px",
						flex: 1,
						color: "#e1dbe8",
					}}
				>
					<FileText size={16} />
					<span style={{ fontSize: "12px", fontWeight: 600 }}>
						PDF Reader
					</span>
				</div>
				{pdfUrl && (
					<button
						onClick={closeFile}
						title="Close file"
						className="icon-button"
						style={{
							width: "28px",
							height: "28px",
							padding: "4px",
						}}
					>
						<X size={14} />
					</button>
				)}
			</div>

			<div className="pdf-content">
				{pdfUrl ? (
					<iframe
						src={`${pdfUrl}#toolbar=0&navpanes=0`}
						title="Local PDF Viewer"
						className="pdf-frame"
					/>
				) : (
					<div className="empty-state">
						<FileText size={36} strokeWidth={1.5} />
						<h3>No PDF Opened</h3>
						<p>
							Select a PDF from your device. It stays locally in
							your browser.
						</p>
						<label className="secondary-button upload-button">
							<Upload size={15} /> Select PDF
							<input
								type="file"
								accept="application/pdf"
								hidden
								onChange={handleFileUpload}
							/>
						</label>
					</div>
				)}
			</div>
		</div>
	);
}
